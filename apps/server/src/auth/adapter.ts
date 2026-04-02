export type SharedSessionResult = {
  connected: boolean;
  reconnectUrl?: string | null;
};

export class AuthAdapter {
  async getSharedSession(chatgptUsername: string): Promise<SharedSessionResult> {
    void chatgptUsername;

    return {
      connected: false,
      reconnectUrl: null
    };
  }
}

