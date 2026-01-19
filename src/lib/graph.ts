import { getDriver } from './neo4j';
import { Transaction } from 'neo4j-driver';

/**
 * 위키 문서와 언급된 키워드를 Neo4j 지식 그래프에 동기화합니다.
 * 
 * @param tx - 활성화된 Neo4j 트랜잭션
 * @param title - 문서 제목 (메인 노드가 됨)
 * @param linkedKeywords - '[[ ]]'에서 추출된 키워드 배열 (연관 노드가 됨)
 */
export async function syncArticleToGraph(tx: Transaction, title: string, linkedKeywords: string[], tags: string[] = []) {
    // Cypher 쿼리
    // 1. 메인 토픽 노드 병합 (MERGE)
    // 2. 연결된 키워드 노드 병합 & 관계 설정
    // 3. 태그 노드 병합 & 관계(TAGGED) 설정

    await tx.run(`
        MERGE (main:Topic { name: $title })
        ON CREATE SET main.createdAt = datetime(), main.visits = 0
        ON MATCH SET main.updatedAt = datetime()
        
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
        tags
    });
}
