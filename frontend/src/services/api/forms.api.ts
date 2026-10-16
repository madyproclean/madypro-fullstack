import { CustomForm, CustomFormSubmission, FormField } from '../../types/form';
import { apiFetch } from './client';

export async function listForms(token: string) {
  return apiFetch<CustomForm[]>({ path: 'forms', token });
}

export async function createForm(token: string, name: string, fields: FormField[]) {
  return apiFetch<CustomForm>({
    path: 'forms',
    token,
    options: { method: 'POST', body: JSON.stringify({ name, fields }) },
  });
}

export async function archiveForm(token: string, id: string) {
  return apiFetch<{ archived: boolean }>({
    path: `forms/${id}`,
    token,
    options: { method: 'DELETE' },
  });
}

export async function listFormSubmissions(token: string, formId: string) {
  return apiFetch<CustomFormSubmission[]>({ path: `forms/${formId}/submissions`, token });
}
