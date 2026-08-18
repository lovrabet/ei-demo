import React, { useEffect, useState } from "react";
import { isInIcestark } from "@ice/stark-app";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  Layout,
  Menu,
  Button,
  Breadcrumb,
  Avatar,
  Space,
  Dropdown,
} from "antd";
import type { MenuProps } from "antd";
import {
  HomeOutlined,
  DashboardOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  FileTextOutlined,
  FileSearchOutlined,
  AuditOutlined,
  CalculatorOutlined,
  SafetyCertificateOutlined,
  PercentageOutlined,
  InboxOutlined,
  FileProtectOutlined,
} from "@ant-design/icons";

const { Header, Sider, Content } = Layout;
const MOBILE_LAYOUT_QUERY = "(max-width: 767px)";

function isMobileViewport() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(MOBILE_LAYOUT_QUERY).matches
  );
}

// 路由配置，用于生成面包屑
const routeConfig = [
  { path: "/", title: "首页" },
  { path: "/workbench", title: "工作台" },
  { path: "/approval-center", title: "审批中心" },
  { path: "/my-todo", title: "审批待办" },
  { path: "/my-submitted", title: "我提交的流程" },
  { path: "/my-done", title: "审批已办" },
  { path: "/application-list", title: "申请单汇总" },
  { path: "/contracts", title: "合同工作台" },
  { path: "/customer-360", title: "客户 360" },
  { path: "/receivable-contract-detail", title: "收款合同详情" },
  { path: "/receivable-plan-form", title: "收款计划维护" },
  { path: "/invoice-center", title: "发票中心" },
  { path: "/expense-rules", title: "报销规则" },
  { path: "/partner-form", title: "新建商业伙伴" },
  { path: "/contract-form", title: "新建付款合同" },
  { path: "/sales-contract-form", title: "新建对外销售合同" },
  { path: "/payment-form", title: "新建付款" },
  { path: "/salary-payment-form", title: "新建工资付款" },
  { path: "/expense-form", title: "新建报销" },
  { path: "/travel-form", title: "新建差旅出行" },
  { path: "/invoice-form", title: "销项发票申请" },
  { path: "/invoice-archive-form", title: "进项发票归档" },
  { path: "/credential-form", title: "新建资质" },
  { path: "/legal-agreements", title: "法务协议" },
];

const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // 菜单收起/展开状态
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  const [collapsed, setCollapsed] = useState(isMobileViewport);
  // 菜单是否完全隐藏
  const [menuHidden, setMenuHidden] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const handleViewportChange = (
      event: MediaQueryListEvent | MediaQueryList,
    ) => {
      setIsMobile(event.matches);
      setCollapsed(event.matches);
    };

    handleViewportChange(mediaQuery);
    mediaQuery.addEventListener("change", handleViewportChange);
    return () => mediaQuery.removeEventListener("change", handleViewportChange);
  }, []);

  const menuItems: MenuProps["items"] = [
    {
      key: "/",
      icon: <HomeOutlined />,
      label: "首页",
    },
    {
      key: "/workbench",
      icon: <DashboardOutlined />,
      label: "工作台",
    },
    {
      key: "/approval-center",
      icon: <AuditOutlined />,
      label: "审批中心",
    },
    {
      key: "/my-submitted",
      icon: <FileTextOutlined />,
      label: "我提交的流程",
    },
    {
      key: "/application-list",
      icon: <FileSearchOutlined />,
      label: "申请单汇总",
    },
    {
      key: "/expense-rules",
      icon: <PercentageOutlined />,
      label: "报销规则",
    },
    {
      key: "biz",
      icon: <FileTextOutlined />,
      label: "业务单据",
      children: [
        {
          key: "/contracts",
          label: "合同工作台",
          icon: <FileProtectOutlined />,
        },
        {
          key: "/customer-360",
          label: "客户 360",
          icon: <UserOutlined />,
        },
        {
          key: "/partner-form",
          label: "录入供应商 / 服务商",
          icon: <FileTextOutlined />,
        },
        {
          key: "/contract-form",
          label: "新建付款合同",
          icon: <FileTextOutlined />,
        },
        {
          key: "/payment-form",
          label: "新建付款",
          icon: <FileTextOutlined />,
        },
        {
          key: "/salary-payment-form",
          label: "新建工资付款",
          icon: <FileTextOutlined />,
        },
        {
          key: "/expense-form",
          label: "新建报销",
          icon: <FileTextOutlined />,
        },
        {
          key: "/travel-form",
          label: "新建差旅出行",
          icon: <FileTextOutlined />,
        },
        {
          key: "/invoice-center",
          label: "发票中心",
          icon: <FileSearchOutlined />,
        },
        {
          key: "/invoice-form",
          label: "申请开具销项发票",
          icon: <FileTextOutlined />,
        },
        {
          key: "/invoice-archive-form",
          label: "录入进项发票",
          icon: <InboxOutlined />,
        },
        {
          key: "/credential-form",
          label: "新建资质",
          icon: <FileTextOutlined />,
        },
      ],
    },
    {
      key: "/legal-agreements",
      icon: <SafetyCertificateOutlined />,
      label: "法务协议",
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    // 如果是外部链接（以 http:// 或 https:// 开头），在新标签页打开
    if (key.startsWith("http://") || key.startsWith("https://")) {
      window.open(key, "_blank", "noopener,noreferrer");
    } else {
      navigate(key);
    }
    if (isMobile) setCollapsed(true);
  };

  const toggleCollapsed = () => {
    setCollapsed((current) => !current);
  };

  const toggleMenuHidden = () => {
    setMenuHidden(!menuHidden);
    // 如果隐藏菜单，同时收起菜单
    if (!menuHidden) {
      setCollapsed(true);
    }
  };

  // 生成面包屑
  const getBreadcrumbItems = () => {
    const items: any[] = [{ title: "首页" }];
    const currentRoute = routeConfig.find((r) => r.path === location.pathname);
    if (currentRoute && currentRoute.path !== "/") {
      items.push({ title: currentRoute.title });
    }
    return items;
  };

  // 用户菜单
  const userMenuItems: MenuProps["items"] = [
    {
      key: "profile",
      label: "个人中心",
      icon: <UserOutlined />,
    },
    {
      key: "settings",
      label: "系统设置",
    },
    {
      type: "divider",
    },
    {
      key: "logout",
      label: "退出登录",
      danger: true,
    },
  ];

  // 可选：根据isInIcestark()判断当前运行环境，被嵌入时，不渲染layout布局
  if (isInIcestark()) {
    return (
      <div className="micro-app-content">
        <Outlet />
      </div>
    );
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {!menuHidden && (
        <Sider
          className="main-layout-sider"
          trigger={null}
          collapsible
          collapsed={collapsed}
          collapsedWidth={isMobile ? 0 : 80}
          width={220}
          style={{ background: "#fff" }}
        >
          {/* 系统标题 */}
          <div
            style={{
              height: 64,
              padding: collapsed ? "16px 8px" : "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              background: "#fff",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            {!collapsed ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img
                  src="/logo.svg"
                  alt="Logo"
                  style={{ height: 28, width: 28 }}
                />
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  Lovrabet System
                </span>
              </div>
            ) : (
              <img
                src="/logo.svg"
                alt="Logo"
                style={{ height: 28, width: 28 }}
              />
            )}
          </div>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={handleMenuClick}
            style={{
              height: "calc(100vh - 64px)",
              borderRight: 0,
            }}
            className="custom-menu"
          />
        </Sider>
      )}
      {isMobile && !menuHidden && !collapsed ? (
        <button
          type="button"
          className="main-layout-mobile-mask"
          aria-label="关闭导航菜单"
          onClick={() => setCollapsed(true)}
        />
      ) : null}
      <Layout>
        <Header
          className="main-layout-header"
          style={{
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 2px 8px 0 rgba(29,35,41,.05)",
            height: 64,
            background: "#fff",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Button
              type="text"
              aria-label={collapsed ? "打开导航菜单" : "收起导航菜单"}
              title={collapsed ? "打开导航菜单" : "收起导航菜单"}
              icon={
                menuHidden ? (
                  <MenuUnfoldOutlined />
                ) : collapsed ? (
                  <MenuUnfoldOutlined />
                ) : (
                  <MenuFoldOutlined />
                )
              }
              onClick={menuHidden ? toggleMenuHidden : toggleCollapsed}
              style={{
                fontSize: 16,
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            />
            {menuHidden && (
              <Button
                type="text"
                icon={<MenuUnfoldOutlined />}
                onClick={toggleMenuHidden}
                style={{
                  fontSize: 14,
                  height: 32,
                }}
              >
                显示菜单
              </Button>
            )}
            {/* 面包屑导航 */}
            <Breadcrumb
              items={getBreadcrumbItems()}
              style={{
                marginLeft: menuHidden ? 0 : 16,
                fontSize: 14,
              }}
              itemRender={(route, params, routes, paths) => {
                const isLast = routes.indexOf(route) === routes.length - 1;
                return (
                  <span
                    style={{
                      color: isLast ? "#262626" : "#595959",
                      fontWeight: isLast ? 500 : 400,
                    }}
                  >
                    {route.title}
                  </span>
                );
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* 用户信息 */}
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space
                style={{
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: 4,
                  transition: "background 0.3s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(0,0,0,0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <Avatar
                  size="small"
                  icon={<UserOutlined />}
                  style={{ background: "#1890ff" }}
                />
                <span
                  className="main-layout-user-name"
                  style={{ fontSize: 14 }}
                >
                  管理员
                </span>
              </Space>
            </Dropdown>
          </div>
        </Header>
        <Content
          className="main-layout-content"
          style={{
            margin: "16px",
            padding: 24,
            minHeight: 280,
            background: "#fff",
            borderRadius: 8,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
