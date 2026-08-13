/**
 * 客户 360 维护：编辑客户、维护联系人、记录跟进。
 *
 * [脚本名称] cpoManageCustomer360
 * [脚本类型] ENDPOINT
 * [接口路径] POST /api/endpoint/app-4d050189/cpoManageCustomer360
 */

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function positiveId(value, field) {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) {
    throw new Error(`INVALID_PARAMS:${field}`);
  }
  return result;
}

function createdId(response) {
  return Number(response?.id || response?.data?.id || response) || 0;
}

export default async function cpoManageCustomer360(params, context) {
  const action = text(params?.action);
  const [map, actor] = await Promise.all([
    context.client.bff.execute({ scriptName: "cpoDatasetMap", params: {} }),
    context.client.bff.execute({ scriptName: "cpoCurrentActor", params: {} }),
  ]);
  if (!text(actor?.userId)) throw new Error("CPO_ACTOR_MISSING");
  const C = map.DATASET_CODES;
  const models = context.client.models;

  if (action === "create_company") {
    const company = params?.company || {};
    const name = text(company.name);
    const uscc = text(company.uscc);
    if (!name || !uscc) throw new Error("CUSTOMER_NAME_AND_USCC_REQUIRED");
    const model = models[`dataset_${C.crmCompany}`];
    const duplicateResponse = await model.filter({
      where: { uscc: { $eq: uscc } },
      currentPage: 1,
      pageSize: 10,
    });
    if ((duplicateResponse?.tableData || []).length) {
      throw new Error("CUSTOMER_USCC_DUPLICATED");
    }
    const companyId = createdId(
      await model.create({
        name,
        uscc,
        legal_rep: text(company.legalRep) || null,
        industry: text(company.industry) || null,
        reg_address: text(company.regAddress) || null,
        business_scope: text(company.businessScope) || null,
        status_code: text(company.statusCode) || "LEAD",
      }),
    );
    return { success: true, action, companyId };
  }

  if (action === "update_company") {
    const companyId = positiveId(params?.companyId, "companyId");
    const model = models[`dataset_${C.crmCompany}`];
    const current = await model.getOne({ id: companyId });
    if (!current?.id) throw new Error("CUSTOMER_NOT_FOUND");
    const company = params?.company || {};
    const name = text(company.name) || text(current.name);
    const uscc = text(company.uscc) || text(current.uscc);
    if (!name || !uscc) throw new Error("CUSTOMER_NAME_AND_USCC_REQUIRED");
    await model.update({
      id: companyId,
      name,
      uscc,
      legal_rep: text(company.legalRep) || null,
      industry: text(company.industry) || null,
      reg_address: text(company.regAddress) || null,
      business_scope: text(company.businessScope) || null,
      status_code: text(company.statusCode) || null,
    });
    return { success: true, action, companyId };
  }

  if (action === "save_contact") {
    const companyId = positiveId(params?.companyId, "companyId");
    const contact = params?.contact || {};
    const contactId = Number(contact.id) || 0;
    const name = text(contact.name);
    if (!name) throw new Error("CONTACT_NAME_REQUIRED");
    const model = models[`dataset_${C.crmContact}`];
    const payload = {
      company_id: companyId,
      name,
      title: text(contact.title) || null,
      phone: text(contact.phone) || null,
      email: text(contact.email) || null,
      wechat: text(contact.wechat) || null,
      dept: text(contact.dept) || null,
      is_primary: contact.isPrimary ? 1 : 0,
      remarks: text(contact.remarks) || null,
    };
    if (contactId) {
      const current = await model.getOne({ id: contactId });
      if (!current?.id || Number(current.company_id) !== companyId) {
        throw new Error("CONTACT_NOT_FOUND");
      }
      await model.update({ id: contactId, ...payload });
      return { success: true, action, companyId, contactId };
    }
    return {
      success: true,
      action,
      companyId,
      contactId: createdId(await model.create(payload)),
    };
  }

  if (action === "create_follow_up") {
    const opportunityId = positiveId(params?.opportunityId, "opportunityId");
    const followUp = params?.followUp || {};
    const subject = text(followUp.subject);
    const content = text(followUp.content);
    if (!subject && !content) throw new Error("FOLLOW_UP_CONTENT_REQUIRED");
    const model = models[`dataset_${C.crmFollowUp}`];
    const result = await model.create({
      opportunity_id: opportunityId,
      contact_id: Number(followUp.contactId) || null,
      follow_type: text(followUp.followType) || "MEETING",
      subject: subject || null,
      content: content || null,
      next_action: text(followUp.nextAction) || null,
      next_action_at: text(followUp.nextActionAt) || null,
      followed_at: text(followUp.followedAt) || new Date().toISOString(),
      owner_user_id: positiveId(actor.userId, "actor.userId"),
    });
    return {
      success: true,
      action,
      opportunityId,
      followUpId: createdId(result),
    };
  }

  throw new Error(`CUSTOMER_360_ACTION_UNSUPPORTED:${action}`);
}
