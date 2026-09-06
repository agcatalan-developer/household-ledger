import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { keys, queryClient } from '../lib/queries';
import type { Me } from '../lib/types';

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api<Me>('/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useCurrency(): string {
  const { data } = useMe();
  return data?.household.currency ?? 'PHP';
}

export async function login(email: string, password: string): Promise<void> {
  await api('/auth/login', { method: 'POST', body: { email, password } });
  // Refetch /me so it carries the full shape (members, currency) the app renders from.
  await queryClient.invalidateQueries({ queryKey: keys.me });
  await queryClient.refetchQueries({ queryKey: keys.me });
}

export async function logout(): Promise<void> {
  await api('/auth/logout', { method: 'POST' });
  queryClient.clear();
}
