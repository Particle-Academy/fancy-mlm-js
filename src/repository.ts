import type { MemberRepository, RewardSink } from "./contracts";
import type { Member } from "./member";
import type { RewardComputation } from "./reward";

/** In-memory {@link MemberRepository} — handy for tests and small/static trees. */
export class ArrayMemberRepository implements MemberRepository {
  private readonly byId = new Map<string, Member>();

  constructor(members: Member[] = []) {
    for (const member of members) {
      this.byId.set(member.id, member);
    }
  }

  add(member: Member): this {
    this.byId.set(member.id, member);
    return this;
  }

  find(id: string): Member | null {
    return this.byId.get(id) ?? null;
  }
}

/** {@link RewardSink} that simply collects every reward — the default Node sink. */
export class CollectingRewardSink implements RewardSink {
  readonly paid: RewardComputation[] = [];

  pay(reward: RewardComputation): void {
    this.paid.push(reward);
  }
}
