import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const { signInWithOtp } = vi.hoisted(() => ({ signInWithOtp: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithOtp,
    },
  },
}));

import { AuthProvider, useAuth } from '../lib/auth';

// The login form must never create accounts: with the default
// (shouldCreateUser: true) any email address could register itself as an
// authenticated user and spend the email rate limit the admin login needs.
describe('magic-link sign-in', () => {
  it('never creates a user', async () => {
    let auth: ReturnType<typeof useAuth> | null = null;
    function Probe() {
      auth = useAuth();
      return null;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(auth).not.toBeNull());
    await auth!.signInWithEmail('someone@example.com');
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(false);
  });
});
