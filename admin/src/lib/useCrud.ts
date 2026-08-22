import { useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Hook padrão de listagem com React Query.
 * Substitui o padrão manual `const [items, setItems] = useState([]); const load = async () => {...}`.
 */
export function useCrudList(
  key: string,
  fetcher: () => Promise<any>,
  deps: any[] = []
) {
  const queryClient = useQueryClient();
  const queryKey = ["crud", key, ...deps];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetcher();
      const data = res?.data ?? res;
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.items)) return data.items;
      return [];
    },
  });
  const reload = () => queryClient.invalidateQueries({ queryKey: ["crud", key] });
  return {
    items: (query.data ?? []) as any[],
    loading: query.isLoading,
    reload,
    queryKey,
  };
}
