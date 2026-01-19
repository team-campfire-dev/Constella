import { getDriver } from './neo4j';
import { Transaction } from 'neo4j-driver';

/**
 * 위키 문서와 언급된 키워드를 Neo4j 지식 그래프에 동기화합니다.
 * 
 * @param tx - 활성화된 Neo4j 트랜잭션
 * @param title - 문서 제목 (메인 노드가 됨)
 * @param linkedKeywords - '[[ ]]'에서 추출된 키워드 배열 (연관 노드가 됨)
 */
export async function syncArticleToGraph(tx: Transaction, title: string, linkedKeywords: string[], tags: string[] = [], topicId?: string) {
    // Cypher 쿼리
    // 1. 메인 토픽 노드 병합 (MERGE)
    // 2. 연결된 키워드 노드 병합 & 관계 설정
    // 3. 태그 노드 병합 & 관계(TAGGED) 설정

    await tx.run(`
        MERGE (main:Topic { name: $title })
        ON CREATE SET main.createdAt = datetime(), main.visits = 0, main.topicId = $topicId
        ON MATCH SET main.updatedAt = datetime(), main.topicId = $topicId
        
        WITH main
        
        // 1. Linked Keywords (Mentions)
        UNWIND $linkedKeywords AS keyword
        MERGE (related:Topic { name: keyword })
        ON CREATE SET related.createdAt = datetime(), related.ghost = true
        MERGE (main)-[r:MENTIONS]->(related)
        ON CREATE SET r.createdAt = datetime()
        
        WITH main
        
        // 2. Tags
        UNWIND $tags AS tagName
        MERGE (tag:Tag { name: tagName })
        MERGE (main)-[t:TAGGED]->(tag)
    `, {
        title,
        linkedKeywords,
        tags,
        topicId: topicId || null
    });
}

/**
 * 별칭(Alias)으로 존재하던 Ghost Node들을 정식 명칭(Canonical Name) 노드로 병합합니다.
 * Ghost Node의 관계를 Canonical Node로 옮기고 Ghost Node를 삭제합니다.
 */
export async function mergeAliasesToCanonical(tx: Transaction, canonicalName: string, aliases: string[]) {
    if (aliases.length === 0) return;

    // Pure Cypher move logic with specific relationships (MENTIONS, TAGGED)
    // Dynamic MERGE with TYPE(r) is not supported in Cypher.

    await tx.run(`
        MERGE (main:Topic { name: $canonicalName })
        
        WITH main
        UNWIND $aliases AS aliasName
        MATCH (ghost:Topic { name: aliasName })
        WHERE ghost <> main
        
        // 1. Move Incoming MENTIONS (Other -> Ghost) => (Other -> Main)
        WITH main, ghost
        OPTIONAL MATCH (other)-[r1:MENTIONS]->(ghost)
        FOREACH (_ IN CASE WHEN r1 IS NOT NULL THEN [1] ELSE [] END |
            MERGE (other)-[:MENTIONS]->(main)
        )
        // note: We delete r1 by DETACH DELETE ghost, or should we delete explicitly?
        // DETACH DELETE deletes incident relationships.
        
        // 2. Move Outgoing MENTIONS (Ghost -> Other) => (Main -> Other)
        WITH main, ghost
        OPTIONAL MATCH (ghost)-[r2:MENTIONS]->(other2)
        FOREACH (_ IN CASE WHEN r2 IS NOT NULL THEN [1] ELSE [] END |
            MERGE (main)-[:MENTIONS]->(other2)
        )

        // 3. Move Outgoing TAGGED (Ghost -> Tag) => (Main -> Tag)
        WITH main, ghost
        OPTIONAL MATCH (ghost)-[r3:TAGGED]->(tag)
        FOREACH (_ IN CASE WHEN r3 IS NOT NULL THEN [1] ELSE [] END |
            MERGE (main)-[:TAGGED]->(tag)
        )

        // 4. Delete Ghost
        WITH ghost
        DETACH DELETE ghost
    `, {
        canonicalName,
        aliases
    });
}
