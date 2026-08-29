import type { Customer } from '@/types/business';

export function filterCustomers(customers: Customer[], query: string): Customer[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return customers;
  }

  return customers.filter((customer) => (
    customer.name.toLocaleLowerCase().includes(normalizedQuery)
    || (customer.phone ?? '').toLocaleLowerCase().includes(normalizedQuery)
  ));
}