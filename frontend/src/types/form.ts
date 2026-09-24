export type FormFieldType = 'text' | 'number' | 'date' | 'boolean' | 'textarea';

export type FormField = {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
};

export type CustomForm = {
  id: string;
  name: string;
  fields: FormField[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomFormSubmission = {
  id: string;
  formId: string;
  interventionId?: string;
  siteId?: string;
  submittedBy: string;
  data: Record<string, unknown>;
  createdAt: string;
};
