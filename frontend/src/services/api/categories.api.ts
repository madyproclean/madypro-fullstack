import { InterventionCategory } from '../../types/category';
import { apiFetch } from './client';

export type CreateCategoryPayload = {
  label: string;
  active?: boolean;
};

export type UpdateCategoryPayload = Partial<CreateCategoryPayload>;

export async function listCategories(token: string) {
  return apiFetch<InterventionCategory[]>({ path: 'categories', token });
}

export async function createCategory(token: string, payload: CreateCategoryPayload) {
  return apiFetch<InterventionCategory>({
    path: 'categories',
    token,
    options: { method: 'POST', body: JSON.stringify(payload) },
  });
}

export async function updateCategory(token: string, id: string, payload: UpdateCategoryPayload) {
  return apiFetch<InterventionCategory>({
    path: `categories/${id}`,
    token,
    options: { method: 'PATCH', body: JSON.stringify(payload) },
  });
}

export async function deleteCategory(token: string, id: string) {
  return apiFetch<{ deleted: boolean }>({
    path: `categories/${id}`,
    token,
    options: { method: 'DELETE' },
  });
}
