import React from "react";
import { InputNumber } from "antd";
import type { InputNumberProps } from "antd";
import styles from "./index.module.css";

type MoneyInputProps = Omit<InputNumberProps<number>, "addonAfter"> & {
  unit?: React.ReactNode;
  minWidth?: number | string;
};

function toResponsiveMinWidth(value: number | string | undefined) {
  if (typeof value === "number") return `min(${value}px, 100%)`;
  return value ? `min(${value}, 100%)` : value;
}

const formatMoney: InputNumberProps<number>["formatter"] = (value, info) => {
  if (info.userTyping) {
    return info.input;
  }
  if (value === undefined || value === null) {
    return "";
  }

  const [integer, decimal] = String(value).split(".");
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimal === undefined
    ? groupedInteger
    : `${groupedInteger}.${decimal}`;
};

const parseMoney: InputNumberProps<number>["parser"] = (value) => {
  return String(value ?? "")
    .replace(/[,\s元人民币¥￥]/g, "")
    .replace(/[^\d.-]/g, "") as unknown as number;
};

export default function MoneyInput({
  unit = "元",
  minWidth = 320,
  precision = 2,
  controls = false,
  placeholder = "0.00",
  formatter = formatMoney,
  parser = parseMoney,
  className,
  style,
  ...props
}: MoneyInputProps) {
  return (
    <InputNumber
      {...props}
      className={[styles.moneyInput, className].filter(Boolean).join(" ")}
      style={{
        minWidth: toResponsiveMinWidth(minWidth),
        ...style,
      }}
      precision={precision}
      controls={controls}
      placeholder={placeholder}
      addonAfter={unit}
      formatter={formatter}
      parser={parser}
    />
  );
}
