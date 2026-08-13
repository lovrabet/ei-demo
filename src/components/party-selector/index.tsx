import React, { useEffect, useState } from "react";
import { Form, Select, message, Space, Typography } from "antd";
import type { FormInstance } from "antd/es/form";
import { DatabaseOutlined } from "@ant-design/icons";
import {
  listCrmCustomers,
  listLocalSuppliers,
  type CrmCustomer,
  type LocalPartner,
} from "@/api/crm";
import { FormRow } from "@/components/form-layout";

const { Text } = Typography;

type BizType = "contract" | "payment" | "travel" | "invoice";

type Props = {
  form: FormInstance<any>;
  bizType: BizType;
  typeName: string; // e.g. "contract_type" / "payment_type"
  partnerName: string; // e.g. "partner_id"
  typeLabel?: string;
  partnerLabel?: string;
  required?: boolean;
  typeRequired?: boolean;
  partnerRequired?: boolean;
  disabled?: boolean;
  hideType?: boolean;
  /**
   * 业务类型字段的"销售"值：合同 sales / 付款 sales？
   * 合同 sales 走 CRM，付款 走 CRM 不太常见，默认 sales = contract 视为走 CRM
   */
  isSalesType?: (typeValue: any) => boolean;
  /** 明确指定客户/供应商数据源；合同资金方向等外部字段控制时优先使用。 */
  customerMode?: boolean;
  children: React.ReactNode; // 类型下拉本体
};

/**
 * PartySelector: 行内两块 - 左侧业务类型下拉（children slot）+ 右侧对方主体下拉
 *
 * 数据源按 bizType 划分：
 *   - 收款业务 → 当前项目的 CRM 客户公司数据集（只读）
 *   - 其他（procurement / service / rent / 认证 / 云服务 / 通讯 / 其他）→ 本地 business_partner 供应商池
 *
 * 当 typeName 字段值变化时，自动清空 partnerName（防止跨数据源残留）。
 */
const PartySelector: React.FC<Props> = ({
  form,
  bizType,
  typeName,
  partnerName,
  typeLabel = "业务类型",
  partnerLabel = "对方主体",
  required = true,
  typeRequired,
  partnerRequired,
  disabled = false,
  hideType = false,
  isSalesType,
  customerMode,
  children,
}) => {
  const typeValue = Form.useWatch(typeName, form);
  const typeIsRequired = typeRequired ?? required;
  const partnerIsRequired = partnerRequired ?? required;
  const salesMode =
    customerMode ??
    (isSalesType ? isSalesType(typeValue) : typeValue === "sales");

  // CRM 客户（仅 sales 模式）
  const [crmOptions, setCrmOptions] = useState<CrmCustomer[]>([]);
  const [crmKeyword, setCrmKeyword] = useState("");
  const [crmLoading, setCrmLoading] = useState(false);

  // 本地供应商
  const [supplierOptions, setSupplierOptions] = useState<LocalPartner[]>([]);
  const [supplierKeyword, setSupplierKeyword] = useState("");

  useEffect(() => {
    if (!salesMode) return;
    setCrmLoading(true);
    listCrmCustomers({ keyword: crmKeyword, pageSize: 200 })
      .then((rows) => setCrmOptions(rows))
      .catch((e: any) => message.error(`加载客户失败：${e?.message || e}`))
      .finally(() => setCrmLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesMode, crmKeyword]);

  useEffect(() => {
    if (salesMode) return;
    listLocalSuppliers({ keyword: supplierKeyword, pageSize: 200 })
      .then((rows) => setSupplierOptions(rows))
      .catch((e: any) => message.error(`加载供应商失败：${e?.message || e}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesMode, supplierKeyword]);

  const typeControl = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, {
        disabled,
        onChange: (...args: any[]) => {
          (children.props as any).onChange?.(...args);
          form.setFieldValue(partnerName, undefined);
        },
      })
    : children;

  return (
    <FormRow
      template={
        hideType
          ? "minmax(320px, 1fr)"
          : "minmax(220px, 1fr) minmax(320px, 2fr)"
      }
    >
      {hideType ? (
        <Form.Item name={typeName} hidden>
          {typeControl}
        </Form.Item>
      ) : (
        <div>
          <Form.Item
            label={typeLabel}
            name={typeName}
            rules={
              typeIsRequired
                ? [{ required: true, message: `请选择${typeLabel}` }]
                : undefined
            }
            style={{ marginBottom: 0 }}
          >
            {typeControl}
          </Form.Item>
        </div>
      )}

      <div>
        <Form.Item
          label={
            <Space size={6}>
              <span>{partnerLabel}</span>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {salesMode ? (
                  <>
                    <DatabaseOutlined style={{ marginRight: 2 }} />
                    客户库
                  </>
                ) : (
                  <>
                    <DatabaseOutlined style={{ marginRight: 2 }} />
                    本地供应商
                  </>
                )}
              </Text>
            </Space>
          }
          name={partnerName}
          rules={
            partnerIsRequired
              ? [{ required: true, message: `请选择${partnerLabel}` }]
              : undefined
          }
          style={{ marginBottom: 0 }}
        >
          {salesMode ? (
            <Select
              disabled={disabled}
              showSearch
              searchValue={crmKeyword}
              onSearch={setCrmKeyword}
              filterOption={false}
              optionFilterProp="label"
              placeholder="按名称或统一信用码搜索客户库"
              notFoundContent={crmLoading ? "加载中..." : "无匹配客户"}
              options={crmOptions.map((p) => ({
                value: Number(p.id),
                label: p.uscc ? `${p.name}（${p.uscc}）` : p.name,
              }))}
            />
          ) : (
            <Select
              disabled={disabled}
              showSearch
              searchValue={supplierKeyword}
              onSearch={setSupplierKeyword}
              filterOption={false}
              optionFilterProp="label"
              placeholder="按名称搜索本系统供应商"
              notFoundContent={
                <span>
                  无匹配供应商。{" "}
                  <a onClick={(e) => e.preventDefault()}>录入新供应商</a>
                </span>
              }
              options={supplierOptions.map((p) => ({
                value: Number(p.id),
                label: p.unified_credit_code
                  ? `${p.name}（${p.unified_credit_code}）`
                  : p.name,
                secondary: [
                  p.supplier_category,
                  p.bank_name,
                  p.bank_account,
                  p.payment_purpose,
                ]
                  .filter(Boolean)
                  .join(" · "),
              }))}
              optionRender={(option) => (
                <Space direction="vertical" size={0}>
                  <span>{option.label}</span>
                  {option.data.secondary ? (
                    <span style={{ color: "#8c8c8c", fontSize: 12 }}>
                      {option.data.secondary}
                    </span>
                  ) : null}
                </Space>
              )}
            />
          )}
        </Form.Item>
      </div>
    </FormRow>
  );
};

export default PartySelector;
