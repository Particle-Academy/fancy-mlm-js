/** A refused input. `field` names what was wrong. Mirror of PHP `InvalidInput`. */
export class InvalidInput extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "InvalidInput";
  }
}

/** Base for every refused sponsor assignment. */
export class AttributionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A member's sponsor is set once and never changed or cleared afterwards. */
export class SponsorImmutable extends AttributionError {
  static for(memberId: string, current: string | null, attempted: string | null): SponsorImmutable {
    return new SponsorImmutable(
      `fancy-mlm: sponsor_id is permanent. Member ${memberId} is sponsored by ${current ?? "null"}; refusing to change it to ${attempted ?? "null"}.`,
    );
  }
}

export class SelfReferral extends AttributionError {
  static for(memberId: string): SelfReferral {
    return new SelfReferral(`fancy-mlm: member ${memberId} cannot sponsor themselves.`);
  }
}

export class SponsorCycle extends AttributionError {
  static for(memberId: string, sponsorId: string): SponsorCycle {
    return new SponsorCycle(`fancy-mlm: ${sponsorId} is already in ${memberId}'s downline; sponsoring would create a cycle.`);
  }
}

/** No authorizer is configured (the default), or it returned anything other than true. */
export class CorrectionUnauthorized extends AttributionError {
  static for(memberId: string): CorrectionUnauthorized {
    return new CorrectionUnauthorized(`fancy-mlm: not authorized to correct the sponsor of member ${memberId}.`);
  }
}

export class UnknownMember extends AttributionError {
  static for(memberId: string): UnknownMember {
    return new UnknownMember(`fancy-mlm: no member ${memberId}.`);
  }
}
