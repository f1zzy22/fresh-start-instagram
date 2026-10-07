// Only explicitly recognized profile failures can be skipped. Login, account,
// restriction, browser, storage and unknown failures still stop the queue.
export class ProfileError extends Error {
  constructor(message, {stage, uncertain = false} = {}) {
    super(message);
    this.name = 'ProfileError';
    this.scope = 'profile';
    this.stage = stage;
    this.uncertain = uncertain;
  }
}
export const canSkipProfile = error => error instanceof ProfileError;
