CREATE DATABASE IF NOT EXISTS fixed_assets;
USE fixed_assets;

CREATE TABLE IF NOT EXISTS facode2sn (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facode VARCHAR(50) NOT NULL UNIQUE,
    sn VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 资产主表
CREATE TABLE IF NOT EXISTS assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facode VARCHAR(50) NOT NULL UNIQUE,
    sn VARCHAR(100) NOT NULL,
    asset_name VARCHAR(200) NOT NULL COMMENT '资产名称',
    asset_type VARCHAR(100) COMMENT '资产类型',
    purchase_date DATE NOT NULL COMMENT '采购日期',
    purchase_amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '采购金额',
    depreciation_status VARCHAR(20) NOT NULL DEFAULT 'normal' COMMENT '折旧状态: normal-正常, fully_depreciated-已折旧完, partial-部分折旧',
    depreciation_months INT NOT NULL DEFAULT 36 COMMENT '折旧月数',
    current_value DECIMAL(12,2) COMMENT '当前净值',
    repair_count INT NOT NULL DEFAULT 0 COMMENT '维修次数',
    status VARCHAR(20) NOT NULL DEFAULT 'in_use' COMMENT '状态: in_use-使用中, borrowed-借用中, idle-闲置, scrap_pending-待报废, scrapped-已报废',
    location VARCHAR(200) COMMENT '存放位置',
    custodian VARCHAR(100) COMMENT '保管人',
    description TEXT COMMENT '备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_facode (facode),
    INDEX idx_status (status),
    INDEX idx_sn (sn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产主表';

-- 借用记录表
CREATE TABLE IF NOT EXISTS borrow_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_id INT NOT NULL,
    facode VARCHAR(50) NOT NULL,
    borrower VARCHAR(100) NOT NULL COMMENT '借用人',
    borrow_date DATE NOT NULL COMMENT '借用日期',
    expected_return_date DATE COMMENT '预计归还日期',
    actual_return_date DATE COMMENT '实际归还日期',
    purpose VARCHAR(500) COMMENT '借用用途',
    status VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '状态: active-借用中, returned-已归还',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_asset_id (asset_id),
    INDEX idx_facode (facode),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='借用记录表';

-- 维修记录表
CREATE TABLE IF NOT EXISTS repair_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_id INT NOT NULL,
    facode VARCHAR(50) NOT NULL,
    repair_date DATE NOT NULL COMMENT '维修日期',
    repair_type VARCHAR(100) COMMENT '维修类型',
    repair_cost DECIMAL(12,2) DEFAULT 0 COMMENT '维修费用',
    repair_description TEXT COMMENT '维修说明',
    repairer VARCHAR(100) COMMENT '维修人',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_asset_id (asset_id),
    INDEX idx_facode (facode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='维修记录表';

-- 报废流程表
CREATE TABLE IF NOT EXISTS scrap_process (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_id INT NOT NULL,
    facode VARCHAR(50) NOT NULL,
    sn VARCHAR(100) NOT NULL,
    applicant VARCHAR(100) NOT NULL COMMENT '申请人(资产管理员)',
    apply_date DATE NOT NULL COMMENT '申请日期',
    scrap_reason TEXT COMMENT '报废原因',
    check_result JSON COMMENT '报废检查结果',
    status VARCHAR(20) NOT NULL DEFAULT 'pending_finance' COMMENT '状态: pending_finance-待财务确认, finance_approved-财务已批准, finance_rejected-财务已拒绝, completed-已完成',
    finance_confirm_by VARCHAR(100) COMMENT '财务确认人',
    finance_confirm_date DATE COMMENT '财务确认日期',
    finance_remark TEXT COMMENT '财务备注',
    scrap_complete_date DATE COMMENT '报废完成日期',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_asset_id (asset_id),
    INDEX idx_facode (facode),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='报废流程表';

-- 报废扫码记录表
CREATE TABLE IF NOT EXISTS scrap_scan_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_id INT NOT NULL,
    facode VARCHAR(50) NOT NULL,
    sn VARCHAR(100) NOT NULL,
    scan_user VARCHAR(100) COMMENT '扫码人',
    scan_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '扫码时间',
    photo_path VARCHAR(500) COMMENT '拍照路径',
    remark TEXT COMMENT '说明',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_asset_id (asset_id),
    INDEX idx_facode (facode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='报废设备扫码记录表';

-- 插入测试数据 - facode2sn
INSERT INTO facode2sn (facode, sn) VALUES 
('FA001', 'SN2024001'),
('FA002', 'SN2024002'),
('FA003', 'SN2024003'),
('FA004', 'SN2021001'),
('FA005', 'SN2020001'),
('FA006', 'SN2023001'),
('TEST-01', 'SN-TEST-001');

-- 插入测试数据 - 资产主表
INSERT INTO assets (facode, sn, asset_name, asset_type, purchase_date, purchase_amount, depreciation_status, depreciation_months, current_value, repair_count, status, location, custodian) VALUES
('FA001', 'SN2024001', 'MacBook Pro 14寸', '电脑设备', '2024-01-15', 14999.00, 'normal', 36, 12499.17, 0, 'in_use', '研发部-A区', '张三'),
('FA002', 'SN2024002', 'Dell显示器 27寸', '办公设备', '2024-03-20', 2999.00, 'normal', 36, 2499.17, 1, 'in_use', '研发部-A区', '李四'),
('FA003', 'SN2024003', 'HP激光打印机', '办公设备', '2024-02-10', 3599.00, 'normal', 36, 2999.17, 2, 'borrowed', '行政部', '王五'),
('FA004', 'SN2021001', 'Lenovo ThinkPad', '电脑设备', '2021-06-01', 8999.00, 'partial', 36, 1499.83, 3, 'in_use', '市场部', '赵六'),
('FA005', 'SN2020001', 'Dell笔记本电脑', '电脑设备', '2020-01-10', 7999.00, 'fully_depreciated', 36, 0.00, 5, 'idle', '仓库', '无'),
('FA006', 'SN2023001', '投影仪', '会议设备', '2023-08-15', 4599.00, 'normal', 36, 3577.00, 0, 'in_use', '会议室A', '行政部');

-- 插入测试数据 - 借用记录
INSERT INTO borrow_records (asset_id, facode, borrower, borrow_date, expected_return_date, purpose, status) VALUES
(3, 'FA003', '市场部-小明', '2025-05-01', '2025-06-15', '展会活动使用', 'active');

-- 插入测试数据 - 维修记录
INSERT INTO repair_records (asset_id, facode, repair_date, repair_type, repair_cost, repair_description, repairer) VALUES
(2, 'FA002', '2024-11-15', '屏幕维修', 300.00, '屏幕闪烁，更换灯管', '维修部-李工'),
(3, 'FA003', '2024-08-10', '耗材更换', 200.00, '更换硒鼓', '行政部'),
(3, 'FA003', '2025-02-20', '故障维修', 500.00, '卡纸故障修复', '维修部-王工'),
(4, 'FA004', '2022-09-10', '电池更换', 800.00, '电池老化，更换电池', '维修部-李工'),
(4, 'FA004', '2023-06-15', '内存升级', 500.00, '升级内存到16G', '维修部-李工'),
(4, 'FA004', '2024-10-20', '硬盘更换', 1200.00, '更换SSD硬盘', '维修部-王工'),
(5, 'FA005', '2021-05-10', '系统重装', 100.00, '系统崩溃重装', '维修部-李工'),
(5, 'FA005', '2022-08-15', '键盘更换', 400.00, '键盘进水更换', '维修部-王工'),
(5, 'FA005', '2023-03-20', '电池更换', 600.00, '电池鼓包更换', '维修部-李工'),
(5, 'FA005', '2023-11-10', '屏幕维修', 1500.00, '屏幕摔坏更换', '维修部-王工'),
(5, 'FA005', '2024-06-15', '电源更换', 300.00, '电源适配器更换', '维修部-李工');

-- 创建 api 用户 (适配用户测试场景)
CREATE USER IF NOT EXISTS 'api'@'%' IDENTIFIED BY 'FJzzCT#api';
GRANT SELECT, INSERT, UPDATE ON fixed_assets.* TO 'api'@'%';
FLUSH PRIVILEGES;
