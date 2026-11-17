jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({})) }));

import { createClient } from '@supabase/supabase-js';
import '@/lib/supabase';

it('creates the Supabase client with the PKCE flow and no automatic URL session detection', () => {
  expect(createClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
    auth: { flowType: 'pkce', detectSessionInUrl: false },
  });
});
