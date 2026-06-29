import type { Member } from "./member";
import type { RewardComputation } from "./reward";

/**
 * Port the host implements so the engine can read the network. Synchronous to
 * stay byte-for-byte aligned with the PHP engine; back it with a Map, an ORM
 * cache, etc.
 */
export interface MemberRepository {
  find(id: string): Member | null;
}

/**
 * Port that receives each computed reward — award points, write a ledger row,
 * enqueue a job. The engine never knows which.
 */
export interface RewardSink {
  pay(reward: RewardComputation): void;
}
