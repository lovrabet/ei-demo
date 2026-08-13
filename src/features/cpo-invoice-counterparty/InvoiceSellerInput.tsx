import React, { useEffect, useMemo, useState } from "react";
import { LinkOutlined } from "@ant-design/icons";
import { AutoComplete, Button, Input, Space, Tooltip, Typography } from "antd";
import { listLocalSuppliers, type LocalPartner } from "@/api/crm";
import PartnerCreateDrawer from "./PartnerCreateDrawer";

type InvoiceSellerInputProps = {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  partnerId?: number;
  partnerName?: string;
  onPartnerChange: (partner: LocalPartner | null, sellerName: string) => void;
};

type PartnerOption = {
  key: string;
  value: string;
  label: React.ReactNode;
  partner: LocalPartner;
};

function normalizedName(value: unknown) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s（）()·・,，.。-]/g, "");
}

export default function InvoiceSellerInput({
  value,
  onChange,
  disabled,
  partnerId,
  partnerName,
  onPartnerChange,
}: InvoiceSellerInputProps) {
  const [matches, setMatches] = useState<LocalPartner[]>([]);
  const [matching, setMatching] = useState(false);
  const [matchFailed, setMatchFailed] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const sellerName = String(value || "");

  useEffect(() => {
    const keyword = (searchKeyword || sellerName).trim();
    if (disabled || keyword.length < 2) {
      setMatches([]);
      setMatching(false);
      setMatchFailed(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setMatching(true);
      setMatchFailed(false);
      listLocalSuppliers({ keyword, pageSize: 20 })
        .then((rows) => {
          if (!active) return;
          setMatches(rows);
        })
        .catch(() => {
          if (!active) return;
          setMatches([]);
          setMatchFailed(true);
        })
        .finally(() => {
          if (active) setMatching(false);
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [disabled, searchKeyword, sellerName]);

  const options = useMemo<PartnerOption[]>(() => {
    const rows = [...matches];
    if (
      partnerId &&
      partnerName &&
      !rows.some((item) => Number(item.id) === Number(partnerId))
    ) {
      rows.unshift({
        id: Number(partnerId),
        name: partnerName,
        partner_type: "supplier",
        status: "active",
      });
    }
    const keyword = normalizedName(searchKeyword || sellerName);
    rows.sort((left, right) => {
      const leftName = normalizedName(left.name);
      const rightName = normalizedName(right.name);
      const score = (name: string) => {
        if (!keyword) return 3;
        if (name === keyword) return 0;
        if (name.startsWith(keyword)) return 1;
        if (name.includes(keyword)) return 2;
        return 3;
      };
      return score(leftName) - score(rightName);
    });
    return rows.map((partner) => ({
      key: String(partner.id),
      value: partner.name,
      label: (
        <Space direction="vertical" size={0}>
          <span>{partner.name}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {partner.unified_credit_code
              ? `统一社会信用代码：${partner.unified_credit_code}`
              : "选择后关联为现有供应商"}
          </Typography.Text>
        </Space>
      ),
      partner,
    }));
  }, [matches, partnerId, partnerName, searchKeyword, sellerName]);

  const selectPartner = (_: string, option: PartnerOption) => {
    const nextSellerName = option.partner.name;
    onChange?.(nextSellerName);
    setSearchKeyword(nextSellerName);
    onPartnerChange(option.partner, nextSellerName);
  };

  const changeSellerName = (nextValue: string) => {
    onChange?.(nextValue);
    setSearchKeyword(nextValue);
    if (!nextValue.trim() && partnerId) {
      onPartnerChange(null, "");
    }
  };

  const createPartner = () => {
    setCreateDrawerOpen(true);
  };

  const receiveCreatedPartner = (partner: LocalPartner) => {
    onChange?.(partner.name);
    setSearchKeyword(partner.name);
    setMatches((current) => [
      partner,
      ...current.filter((item) => Number(item.id) !== Number(partner.id)),
    ]);
    onPartnerChange(partner, partner.name);
    setCreateDrawerOpen(false);
  };

  const clearPartner = () => onPartnerChange(null, sellerName);

  const notFoundContent = matching
    ? "正在匹配现有供应商"
    : matchFailed
      ? "供应商查询失败，请稍后重试"
      : searchKeyword.trim().length < 2
        ? "输入至少 2 个字开始匹配"
        : "未匹配到供应商，可仅记录销售方名称";

  return (
    <>
      <AutoComplete
        value={sellerName}
        options={options}
        disabled={disabled}
        onChange={changeSellerName}
        onSearch={setSearchKeyword}
        onSelect={selectPartner}
        onFocus={() => setSearchKeyword(sellerName.trim())}
        filterOption={false}
        notFoundContent={notFoundContent}
        popupMatchSelectWidth={420}
        style={{ width: "100%" }}
      >
        <Input
          placeholder="输入票面销售方，自动匹配现有供应商"
          allowClear
          suffix={
            partnerId ? (
              <Tooltip
                title={`已关联供应商：${partnerName || sellerName}，点击解除`}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<LinkOutlined />}
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clearPartner}
                >
                  已关联
                </Button>
              </Tooltip>
            ) : sellerName.trim() ? (
              <Tooltip title="没有合适的候选时，可新建供应商；也可仅记录销售方名称，不关联供应商">
                <Button
                  type="link"
                  size="small"
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={createPartner}
                >
                  新建供应商
                </Button>
              </Tooltip>
            ) : null
          }
        />
      </AutoComplete>
      <PartnerCreateDrawer
        open={createDrawerOpen}
        initialName={sellerName}
        onCancel={() => setCreateDrawerOpen(false)}
        onCreated={receiveCreatedPartner}
      />
    </>
  );
}
