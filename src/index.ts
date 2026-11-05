export type { Member, Tier } from "./member";
export type { MemberRepository, RewardSink } from "./contracts";
export type { RewardComputation } from "./reward";
export { amountAsInt } from "./reward";
export type { PlanData, TreeType } from "./plan";
export { CompensationPlan } from "./plan";
export { ReferralEngine } from "./engine";
export type { TreeStrategy } from "./tree";
export { treeFor, UnilevelTree, BinaryTree, MatrixTree } from "./tree";
export { ArrayMemberRepository, CollectingRewardSink } from "./repository";

// Referral codes, scan logging, attribution, stats
export type {
  AttributionModel,
  AttributionPolicy,
  CodeStatus,
  ReferralCode,
  Scan,
  Attribution,
  AttributionReason,
  AttributionDecision,
  ScanStatus,
  ScanResult,
  StatsGroupBy,
  StatsFilter,
  StatRow,
  MaybePromise,
} from "./attribution/types";
export { InvalidInput, AttributionError, SponsorImmutable, SelfReferral, SponsorCycle, UnknownMember } from "./attribution/errors";
export { CODE_ALPHABET, CODE_DEFAULT_LENGTH, CODE_MIN_LENGTH, CODE_MAX_LENGTH, generateCode, normalizeCode } from "./attribution/codes";
export { SCOPE_MAX_BYTES, scopeKey } from "./attribution/scope";
export type { ScopeInput } from "./attribution/scope";
export { SessionHasher } from "./attribution/hash";
export { policyFrom, codeUsableAt, wouldCycle, assertSponsorAssignable, decideAttribution } from "./attribution/rules";
export type { SponsorLookup } from "./attribution/rules";
export type { AttributionStore } from "./attribution/store";
export { ArrayAttributionStore, statRow, mergeStats } from "./attribution/store";
export { ReferralProgram } from "./attribution/program";
