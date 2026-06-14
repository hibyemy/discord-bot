export class GamblebotError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InsufficientFundsError extends GamblebotError {
  constructor(
    public readonly required: number,
    public readonly available: number,
  ) {
    super(
      `Insufficient funds: need ${required}, have ${available}`,
      'INSUFFICIENT_FUNDS',
    );
  }
}

export class CooldownError extends GamblebotError {
  constructor(
    public readonly action: string,
    public readonly remainingMs: number,
  ) {
    super(
      `Action "${action}" is on cooldown for ${Math.ceil(remainingMs / 1000)}s`,
      'COOLDOWN',
    );
  }
}

export class LockedError extends GamblebotError {
  constructor(
    public readonly feature: string,
    public readonly requiredLevel: number,
    public readonly currentLevel: number,
  ) {
    super(
      `${feature} requires level ${requiredLevel} (current: ${currentLevel})`,
      'LOCKED',
    );
  }
}

export class ValidationError extends GamblebotError {
  constructor(message: string) {
    super(message, 'VALIDATION');
  }
}

export class NotFoundError extends GamblebotError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND');
  }
}

export class DisabledError extends GamblebotError {
  constructor(
    public readonly feature: string,
    public readonly reason: string,
  ) {
    super(`${feature} is disabled: ${reason}`, 'DISABLED');
  }
}

export class AlreadyClaimedError extends GamblebotError {
  constructor(action: string) {
    super(`${action} already claimed`, 'ALREADY_CLAIMED');
  }
}

export class ActiveSessionError extends GamblebotError {
  constructor(gameType: string) {
    super(`Active ${gameType} session already exists`, 'ACTIVE_SESSION');
  }
}
