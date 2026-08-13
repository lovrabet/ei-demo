export const CURRENT_ACTOR_SCRIPT = "cpoGetCurrentActor";

type RawUserInfo = Record<string, unknown>;

export type CurrentActor = {
  userId?: string;
  userName?: string;
  nickname?: string;
  displayName?: string;
  applicant_user_id?: string;
  applicant_name_snapshot?: string;
  roles?: string[];
  raw?: RawUserInfo;
};

type ApplicantFields = {
  applicant_user_id: string;
  applicant_name_snapshot: string;
};

type ApplicantForm = {
  getFieldValue: (name: any) => unknown;
  setFieldsValue: (values: Partial<ApplicantFields>) => void;
};

function optionalText(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function pickFirstText(...values: unknown[]) {
  for (const value of values) {
    const text = optionalText(value);
    if (text) return text;
  }
  return "";
}

export function resolveCurrentActorDisplayName(actor?: CurrentActor | null) {
  const raw = actor?.raw || {};
  return pickFirstText(
    actor?.nickname,
    actor?.displayName,
    raw.nickname,
    raw.nickName,
    raw.nick,
    actor?.userName,
    raw.name,
    raw.userName,
    raw.username,
    actor?.userId,
    raw.userId,
    raw.id,
  );
}

export function currentActorToApplicantFields(
  actor?: CurrentActor | null,
): ApplicantFields | undefined {
  const raw = actor?.raw || {};
  const userId = pickFirstText(
    actor?.applicant_user_id,
    actor?.userId,
    raw.userId,
    raw.id,
    raw.openId,
    raw.open_id,
  );

  if (!userId) {
    return undefined;
  }

  return {
    applicant_user_id: userId,
    applicant_name_snapshot:
      pickFirstText(actor?.applicant_name_snapshot) ||
      resolveCurrentActorDisplayName(actor) ||
      userId,
  };
}

export function prefillApplicantFields(
  form: ApplicantForm,
  actor?: CurrentActor | null,
) {
  if (
    form.getFieldValue("applicant_user_id") ||
    form.getFieldValue("applicant_name_snapshot")
  ) {
    return;
  }

  const fields = currentActorToApplicantFields(actor);
  if (fields) {
    form.setFieldsValue(fields);
  }
}
