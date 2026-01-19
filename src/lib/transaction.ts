import { Prisma, PrismaClient } from '@prisma/client-content';
import { Transaction } from 'neo4j-driver';
import { getDriver } from './neo4j';
import prismaContent from './prisma-content';

type DualTransactionCallback<T> = (
    prismaTx: Prisma.TransactionClient,
    neo4jTx: Transaction
) => Promise<T>;

/**
 * Prisma 트랜잭션과 Neo4j 트랜잭션을 동시에 실행하는 헬퍼 함수
 * 
 * 전략:
 * 1. Neo4j 트랜잭션 시작
 * 2. Prisma 트랜잭션 시작
 * 3. 콜백 함수 실행 (비즈니스 로직)
 * 4. 성공 시: Neo4j 커밋 -> 반환 (Prisma 커밋 유도)
 * 5. 실패 시: Neo4j 롤백 -> 에러 발생 (Prisma 롤백 유도)
 * 
 * 참고: Neo4j가 커밋된 후 Prisma 커밋 단계에서 실패할 경우, 그래프에는 노드가 생겼으나 DB에는 글이 없는 "고스트 노드"가 발생할 수 있습니다.
 * 이는 온톨로지 관점에서 허용 가능한 동작으로 간주합니다.
 */
export async function withDualTransaction<T>(
    callback: DualTransactionCallback<T>
): Promise<T> {
    const driver = getDriver();
    // Neo4j 세션 (Community Edition: 기본 데이터베이스 사용)
    const session = driver.session();
    const neo4jTx = session.beginTransaction();

    try {
        // Prisma 트랜잭션 시작
        const result = await prismaContent.$transaction(async (prismaTx) => {
            try {
                // 비즈니스 로직 실행
                const res = await callback(prismaTx, neo4jTx);

                // Neo4j 우선 커밋
                await neo4jTx.commit();

                // 리턴 시 Prisma 커밋 수행
                return res;
            } catch (error) {
                // 로직 오류 또는 Neo4j 커밋 실패 시 처리
                await neo4jTx.rollback();
                throw error; // 에러를 던져서 Prisma 롤백 유도
            }
        });

        return result;

    } catch (error) {
        throw error;
    } finally {
        await session.close();
    }
}
