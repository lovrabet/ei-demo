import type { FormInstance } from "antd/es/form";
import type { NamePath } from "rc-field-form/es/interface";

export type CpoFormSubmitAction = "draft" | "submit";

type FormLike<T> = Pick<FormInstance<T>, "getFieldsValue" | "validateFields">;

type CollectOptions<T> = {
  draftFieldNames?: NamePath<T>[];
};

export async function collectCpoFormValues<T extends object = any>(
  form: FormLike<T>,
  action: CpoFormSubmitAction,
  options: CollectOptions<T> = {},
): Promise<T> {
  if (action === "submit") {
    return form.validateFields();
  }

  if (options.draftFieldNames?.length) {
    await form.validateFields(options.draftFieldNames);
  }

  return form.getFieldsValue(true) as T;
}
