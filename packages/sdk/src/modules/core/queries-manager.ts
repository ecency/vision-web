import {
  InfiniteData,
  QueryClient,
  QueryKey,
  useInfiniteQuery,
  UseInfiniteQueryOptions,
  useQuery,
  UseQueryOptions,
} from "@tanstack/react-query";
import { CONFIG } from "./config";

/**
 * Builds a client with the SDK's defaults. It is only a factory — request
 * scoping is the host's job, via `ConfigManager.setQueryClientResolver`, since
 * only the host knows where one request ends and the next begins.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        // staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    },
  });
}
export const getQueryClient = () => CONFIG.queryClient;

export namespace EcencyQueriesManager {
  export function getQueryData<T>(queryKey: QueryKey) {
    const queryClient = getQueryClient();
    return queryClient.getQueryData<T>(queryKey);
  }

  export function getInfiniteQueryData<T>(queryKey: QueryKey) {
    const queryClient = getQueryClient();
    return queryClient.getQueryData<InfiniteData<T>>(queryKey);
  }

  export async function prefetchQuery<T>(options: UseQueryOptions<T>) {
    const queryClient = getQueryClient();
    await queryClient.prefetchQuery(options);
    return getQueryData<T>(options.queryKey);
  }

  export async function prefetchInfiniteQuery<T, P>(
    options: UseInfiniteQueryOptions<
      T,
      Error,
      InfiniteData<T>,
      QueryKey,
      P
    >
  ) {
    const queryClient = getQueryClient();
    await queryClient.prefetchInfiniteQuery(options);
    return getInfiniteQueryData<T>(options.queryKey);
  }

  export function generateClientServerQuery<T>(options: UseQueryOptions<T>) {
    return {
      prefetch: () => prefetchQuery(options),
      getData: () => getQueryData<T>(options.queryKey),
      useClientQuery: () => useQuery(options),
      fetchAndGet: () => getQueryClient().fetchQuery(options),
    };
  }

  export function generateClientServerInfiniteQuery<T, P>(
    options: UseInfiniteQueryOptions<
      T,
      Error,
      InfiniteData<T>,
      QueryKey,
      P
    >
  ) {
    return {
      prefetch: () => prefetchInfiniteQuery(options),
      getData: () => getInfiniteQueryData<T>(options.queryKey),
      useClientQuery: () => useInfiniteQuery(options),
      fetchAndGet: () => getQueryClient().fetchInfiniteQuery(options),
    };
  }
}
