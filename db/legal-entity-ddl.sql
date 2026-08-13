-- Legal/internal-entity tables rebuilt from dataset metadata

DROP TABLE IF EXISTS `internal_legal_entity`;
CREATE TABLE `internal_legal_entity` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT NOT NULL COMMENT '主键ID',
  `entity_code` varchar(255) NOT NULL COMMENT '主体编码',
  `entity_name` varchar(255) NOT NULL COMMENT '主体名称',
  `short_name` varchar(255) NULL COMMENT '主体简称',
  `unified_credit_code` varchar(255) NULL COMMENT '统一信用代码',
  `legal_representative` varchar(255) NULL COMMENT '法定代表人',
  `registered_address` varchar(255) NULL COMMENT '注册地址',
  `business_address` varchar(255) NULL COMMENT '经营地址',
  `contact_name` varchar(255) NULL COMMENT '联系人姓名',
  `contact_phone` varchar(255) NULL COMMENT '联系人电话',
  `contact_email` varchar(255) NULL COMMENT '联系人邮箱',
  `bank_name` varchar(255) NULL COMMENT '开户行',
  `bank_account_name` varchar(255) NULL COMMENT '开户名称',
  `bank_account_no` varchar(255) NULL COMMENT '银行账号',
  `invoice_title` varchar(255) NULL COMMENT '发票抬头',
  `invoice_tax_no` varchar(255) NULL COMMENT '纳税人识别号',
  `seal_name` varchar(255) NULL COMMENT '印章名称',
  `status` varchar(50) NOT NULL COMMENT '状态 (ACTIVE|INACTIVE)',
  `is_default` tinyint(1) NOT NULL COMMENT '是否默认主体',
  `sort_no` int NOT NULL COMMENT '排序号',
  `remark` text NULL COMMENT '备注',
  `created_by` varchar(255) NULL COMMENT '创建人',
  `updated_by` varchar(255) NULL COMMENT '更新人',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='我方主体';

DROP TABLE IF EXISTS `legal_agreement`;
CREATE TABLE `legal_agreement` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT NOT NULL COMMENT '主键ID',
  `agreement_no` varchar(255) NOT NULL COMMENT '协议编号',
  `revision_no` int NOT NULL COMMENT '版本号',
  `parent_agreement_id` bigint unsigned NULL COMMENT '父协议ID',
  `agreement_type` varchar(50) NOT NULL COMMENT '协议类型 (NDA|DPA|SERVICE_AGREEMENT|COOPERATION_AGREEMENT|OTHER)',
  `agreement_title` varchar(255) NOT NULL COMMENT '协议标题',
  `status` varchar(50) NOT NULL COMMENT '协议状态 (DRAFT|IN_REVIEW|APPROVED|GENERATED|SENT|SIGNING|SIGNED|EFFECTIVE|TERMINATED|EXPIRED|CANCELLED|REJECTED)',
  `project_name` varchar(255) NULL COMMENT '项目名称',
  `cooperation_matter` varchar(255) NULL COMMENT '合作事项',
  `primary_crm_company_id` bigint unsigned NULL COMMENT 'CRM公司ID',
  `primary_crm_contact_id` bigint unsigned NULL COMMENT 'CRM联系人ID',
  `primary_party_name_snapshot` varchar(255) NULL COMMENT '合作方名称',
  `related_quote_id` bigint unsigned NULL COMMENT '报价ID',
  `template_id` bigint unsigned NULL COMMENT '模板ID',
  `current_document_id` bigint unsigned NULL COMMENT '文档ID',
  `agreement_date` date NULL COMMENT '协议日期',
  `signed_date` date NULL COMMENT '签署日期',
  `effective_date` date NULL COMMENT '生效日期',
  `confidentiality_period_type` varchar(50) NOT NULL COMMENT '保密期限 (FIXED_YEARS|UNTIL_PUBLIC|PERMANENT_FOR_TRADE_SECRET)',
  `confidentiality_years` int unsigned NULL COMMENT '保密年限',
  `return_destroy_days` int unsigned NULL COMMENT '返还天数',
  `breach_penalty_type` varchar(50) NOT NULL COMMENT '违约金类型 (FIXED_AMOUNT|PERCENT_OF_DEAL|ACTUAL_LOSS|NONE)',
  `breach_penalty_amount` decimal(15,2) NULL COMMENT '违约金金额',
  `breach_penalty_percent` decimal(15,2) NULL COMMENT '违约金比例',
  `dispute_resolution_type` varchar(50) NOT NULL COMMENT '争议解决 (LITIGATION|ARBITRATION)',
  `dispute_resolution_org` varchar(255) NULL COMMENT '解决机构',
  `dispute_resolution_place` varchar(255) NULL COMMENT '解决地点',
  `governing_law` varchar(255) NOT NULL COMMENT '适用法律',
  `signing_place` varchar(255) NULL COMMENT '签署地点',
  `external_note` text NULL COMMENT '对外备注',
  `internal_note` text NULL COMMENT '内部备注',
  `owner_user_id` varchar(255) NULL COMMENT '负责人ID',
  `created_by` varchar(255) NULL COMMENT '创建人',
  `updated_by` varchar(255) NULL COMMENT '更新人',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='法务协议';

DROP TABLE IF EXISTS `legal_agreement_party`;
CREATE TABLE `legal_agreement_party` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT NOT NULL COMMENT '主键ID',
  `agreement_id` bigint unsigned NOT NULL COMMENT '协议ID',
  `party_order` int NOT NULL COMMENT '签署方排序',
  `party_title` varchar(255) NOT NULL COMMENT '签署方称谓',
  `party_role` varchar(50) NOT NULL COMMENT '签署方角色 (OUR_SIDE|COUNTERPARTY|THIRD_PARTY)',
  `source_type` varchar(50) NOT NULL COMMENT '主体来源 (INTERNAL_COMPANY|CRM_COMPANY|MANUAL)',
  `crm_company_id` bigint unsigned NULL COMMENT 'CRM公司ID',
  `crm_contact_id` bigint unsigned NULL COMMENT 'CRM联系人ID',
  `company_name_snapshot` varchar(255) NOT NULL COMMENT '公司名称',
  `uscc_snapshot` varchar(255) NULL COMMENT '统一信用代码',
  `legal_rep_snapshot` varchar(255) NULL COMMENT '法定代表人',
  `address_snapshot` varchar(255) NULL COMMENT '地址快照',
  `contact_name_snapshot` varchar(255) NULL COMMENT '联系人姓名',
  `contact_phone_snapshot` varchar(255) NULL COMMENT '联系人电话',
  `contact_email_snapshot` varchar(255) NULL COMMENT '联系人邮箱',
  `authorized_representative` varchar(255) NULL COMMENT '授权代表',
  `representative_title` varchar(255) NULL COMMENT '签署人职务',
  `is_primary_counterparty` tinyint(1) NOT NULL COMMENT '是否主要合作方',
  `remark` text NULL COMMENT '备注',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='协议签署方';

DROP TABLE IF EXISTS `legal_document`;
CREATE TABLE `legal_document` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT NOT NULL COMMENT '主键ID',
  `agreement_id` bigint unsigned NOT NULL COMMENT '协议ID',
  `template_id` bigint unsigned NULL COMMENT '模板ID',
  `document_no` varchar(255) NOT NULL COMMENT '文档编号',
  `document_title` varchar(255) NOT NULL COMMENT '文档标题',
  `document_revision` int NOT NULL COMMENT '文档版本号',
  `file_format` varchar(50) NOT NULL COMMENT '文件格式 (PDF|HTML|DOCX|MARKDOWN|FEISHU_DOC|OTHER)',
  `file_url` varchar(255) NULL COMMENT '文件URL',
  `file_token` varchar(255) NULL COMMENT '文件令牌',
  `file_hash` varchar(255) NULL COMMENT '文件哈希',
  `snapshot_json` json NULL COMMENT '生成快照',
  `rendered_content` mediumtext NULL COMMENT '渲染内容',
  `generated_by` varchar(255) NULL COMMENT '生成人',
  `generated_at` datetime NOT NULL COMMENT '生成时间',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='法务协议文档';

DROP TABLE IF EXISTS `legal_document_template`;
CREATE TABLE `legal_document_template` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT NOT NULL COMMENT '主键ID',
  `template_code` varchar(255) NOT NULL COMMENT '模板编码',
  `template_name` varchar(255) NOT NULL COMMENT '模板名称',
  `template_version` varchar(255) NOT NULL COMMENT '模板版本',
  `agreement_type` varchar(50) NOT NULL COMMENT '协议类型 (NDA|DPA|SERVICE_AGREEMENT|COOPERATION_AGREEMENT|OTHER)',
  `template_format` varchar(50) NOT NULL COMMENT '模板格式 (HTML|DOCX|MARKDOWN|FEISHU_DOC|PDF|OTHER)',
  `renderer` varchar(255) NULL COMMENT '渲染器',
  `template_content` mediumtext NULL COMMENT '模板内容',
  `variable_schema_json` json NULL COMMENT '变量Schema',
  `default_terms_json` json NULL COMMENT '默认条款',
  `is_active` tinyint(1) NOT NULL COMMENT '是否启用',
  `remark` text NULL COMMENT '备注',
  `created_by` varchar(255) NULL COMMENT '创建人',
  `updated_by` varchar(255) NULL COMMENT '更新人',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='法务文档模板';

DROP TABLE IF EXISTS `legal_status_log`;
CREATE TABLE `legal_status_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT NOT NULL COMMENT '主键ID',
  `agreement_id` bigint unsigned NOT NULL COMMENT '协议ID',
  `from_status` varchar(50) NULL COMMENT '变更前状态 (DRAFT|IN_REVIEW|APPROVED|GENERATED|SENT|SIGNING|SIGNED|EFFECTIVE|TERMINATED|EXPIRED|CANCELLED|REJECTED)',
  `to_status` varchar(50) NOT NULL COMMENT '变更后状态 (DRAFT|IN_REVIEW|APPROVED|GENERATED|SENT|SIGNING|SIGNED|EFFECTIVE|TERMINATED|EXPIRED|CANCELLED|REJECTED)',
  `action_code` varchar(50) NOT NULL COMMENT '动作编码 (CREATE|UPDATE|SUBMIT_REVIEW|APPROVE|REJECT|GENERATE_DOCUMENT|SEND|START_SIGNING|MARK_SIGNED|MARK_EFFECTIVE|TERMINATE|EXPIRE|CANCEL|OTHER)',
  `action_name` varchar(255) NULL COMMENT '动作名称',
  `operator_user_id` varchar(255) NULL COMMENT '操作人ID',
  `operator_name` varchar(255) NULL COMMENT '操作人姓名',
  `action_note` text NULL COMMENT '操作备注',
  `payload_json` json NULL COMMENT '操作上下文',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='法务状态日志';

