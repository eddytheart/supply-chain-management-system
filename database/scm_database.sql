-- ============================================================
-- Supply Chain Management System - University of Ibadan
-- Central Stores and Procurement
-- Database schema (MySQL 8 / InnoDB), normalized to 3NF
-- Group 30, Department of Computer Science, University of Ibadan
-- ============================================================

DROP DATABASE IF EXISTS scm_ui;
CREATE DATABASE scm_ui CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE scm_ui;

-- ------------------------------------------------------------
-- 1. PEOPLE AND ACCESS
-- ------------------------------------------------------------

CREATE TABLE roles (
    role_id     INT AUTO_INCREMENT PRIMARY KEY,
    role_name   VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE departments (
    department_id    INT AUTO_INCREMENT PRIMARY KEY,
    department_name  VARCHAR(150) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE users (
    user_id        INT AUTO_INCREMENT PRIMARY KEY,
    full_name      VARCHAR(150) NOT NULL,
    username       VARCHAR(50)  NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role_id        INT NOT NULL,
    department_id  INT NULL,
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_role  FOREIGN KEY (role_id)       REFERENCES roles(role_id),
    CONSTRAINT fk_users_dept  FOREIGN KEY (department_id) REFERENCES departments(department_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2. ITEMS AND SUPPLIERS
-- ------------------------------------------------------------

CREATE TABLE items (
    item_id        INT AUTO_INCREMENT PRIMARY KEY,
    item_name      VARCHAR(150) NOT NULL UNIQUE,
    unit           VARCHAR(30)  NOT NULL,
    reorder_level  INT NOT NULL DEFAULT 0,
    CONSTRAINT chk_items_reorder CHECK (reorder_level >= 0)
) ENGINE=InnoDB;

CREATE TABLE suppliers (
    supplier_id     INT AUTO_INCREMENT PRIMARY KEY,
    supplier_name   VARCHAR(150) NOT NULL UNIQUE,
    contact_person  VARCHAR(100),
    phone           VARCHAR(30),
    email           VARCHAR(120),
    address         VARCHAR(255),
    is_active       TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE supplier_items (
    supplier_id  INT NOT NULL,
    item_id      INT NOT NULL,
    unit_price   DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (supplier_id, item_id),
    CONSTRAINT fk_si_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
    CONSTRAINT fk_si_item     FOREIGN KEY (item_id)     REFERENCES items(item_id),
    CONSTRAINT chk_si_price   CHECK (unit_price >= 0)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3. REQUISITIONS
-- ------------------------------------------------------------

CREATE TABLE requisitions (
    requisition_id  INT AUTO_INCREMENT PRIMARY KEY,
    requested_by    INT NOT NULL,
    department_id   INT NOT NULL,
    reason          TEXT,
    status          ENUM('submitted','approved','rejected','ordered','delivered','closed')
                    NOT NULL DEFAULT 'submitted',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_req_user FOREIGN KEY (requested_by)  REFERENCES users(user_id),
    CONSTRAINT fk_req_dept FOREIGN KEY (department_id) REFERENCES departments(department_id)
) ENGINE=InnoDB;

CREATE TABLE requisition_items (
    requisition_item_id  INT AUTO_INCREMENT PRIMARY KEY,
    requisition_id       INT NOT NULL,
    item_id              INT NOT NULL,
    quantity_requested   INT NOT NULL,
    UNIQUE KEY uq_req_item (requisition_id, item_id),
    CONSTRAINT fk_ri_req  FOREIGN KEY (requisition_id) REFERENCES requisitions(requisition_id),
    CONSTRAINT fk_ri_item FOREIGN KEY (item_id)        REFERENCES items(item_id),
    CONSTRAINT chk_ri_qty CHECK (quantity_requested > 0)
) ENGINE=InnoDB;

CREATE TABLE requisition_status_history (
    history_id      INT AUTO_INCREMENT PRIMARY KEY,
    requisition_id  INT NOT NULL,
    status          ENUM('submitted','approved','rejected','ordered','delivered','closed') NOT NULL,
    changed_by      INT NOT NULL,
    changed_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    comment         VARCHAR(255),
    CONSTRAINT fk_rsh_req  FOREIGN KEY (requisition_id) REFERENCES requisitions(requisition_id),
    CONSTRAINT fk_rsh_user FOREIGN KEY (changed_by)     REFERENCES users(user_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4. PURCHASE ORDERS AND RECEIVING
-- ------------------------------------------------------------

CREATE TABLE purchase_orders (
    po_id           INT AUTO_INCREMENT PRIMARY KEY,
    requisition_id  INT NOT NULL,
    supplier_id     INT NOT NULL,
    created_by      INT NOT NULL,
    order_date      DATE NOT NULL,
    status          ENUM('ordered','delivered','closed') NOT NULL DEFAULT 'ordered',
    CONSTRAINT fk_po_req      FOREIGN KEY (requisition_id) REFERENCES requisitions(requisition_id),
    CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id)    REFERENCES suppliers(supplier_id),
    CONSTRAINT fk_po_user     FOREIGN KEY (created_by)     REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE purchase_order_items (
    po_item_id        INT AUTO_INCREMENT PRIMARY KEY,
    po_id             INT NOT NULL,
    item_id           INT NOT NULL,
    quantity_ordered  INT NOT NULL,
    unit_price        DECIMAL(12,2) NOT NULL,
    UNIQUE KEY uq_po_item (po_id, item_id),
    CONSTRAINT fk_poi_po   FOREIGN KEY (po_id)   REFERENCES purchase_orders(po_id),
    CONSTRAINT fk_poi_item FOREIGN KEY (item_id) REFERENCES items(item_id),
    CONSTRAINT chk_poi_qty   CHECK (quantity_ordered > 0),
    CONSTRAINT chk_poi_price CHECK (unit_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE goods_receipts (
    receipt_id     INT AUTO_INCREMENT PRIMARY KEY,
    po_id          INT NOT NULL,
    received_by    INT NOT NULL,
    received_date  DATE NOT NULL,
    CONSTRAINT fk_gr_po   FOREIGN KEY (po_id)       REFERENCES purchase_orders(po_id),
    CONSTRAINT fk_gr_user FOREIGN KEY (received_by) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE goods_receipt_items (
    receipt_item_id    INT AUTO_INCREMENT PRIMARY KEY,
    receipt_id         INT NOT NULL,
    item_id            INT NOT NULL,
    quantity_received  INT NOT NULL,
    CONSTRAINT fk_gri_receipt FOREIGN KEY (receipt_id) REFERENCES goods_receipts(receipt_id),
    CONSTRAINT fk_gri_item    FOREIGN KEY (item_id)    REFERENCES items(item_id),
    CONSTRAINT chk_gri_qty    CHECK (quantity_received > 0)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5. STOCK (batches support FIFO issuing)
-- ------------------------------------------------------------

CREATE TABLE stock_batches (
    batch_id            INT AUTO_INCREMENT PRIMARY KEY,
    receipt_item_id     INT NOT NULL,
    item_id             INT NOT NULL,
    received_date       DATE NOT NULL,
    quantity_remaining  INT NOT NULL,
    CONSTRAINT fk_sb_receipt_item FOREIGN KEY (receipt_item_id) REFERENCES goods_receipt_items(receipt_item_id),
    CONSTRAINT fk_sb_item         FOREIGN KEY (item_id)         REFERENCES items(item_id),
    CONSTRAINT chk_sb_qty         CHECK (quantity_remaining >= 0)
) ENGINE=InnoDB;

CREATE INDEX idx_sb_fifo ON stock_batches (item_id, received_date, batch_id);

CREATE TABLE stock_issues (
    issue_id        INT AUTO_INCREMENT PRIMARY KEY,
    requisition_id  INT NOT NULL,
    issued_by       INT NOT NULL,
    issue_date      DATE NOT NULL,
    CONSTRAINT fk_issue_req  FOREIGN KEY (requisition_id) REFERENCES requisitions(requisition_id),
    CONSTRAINT fk_issue_user FOREIGN KEY (issued_by)      REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE stock_issue_items (
    issue_item_id    INT AUTO_INCREMENT PRIMARY KEY,
    issue_id         INT NOT NULL,
    batch_id         INT NOT NULL,
    quantity_issued  INT NOT NULL,
    CONSTRAINT fk_sii_issue FOREIGN KEY (issue_id) REFERENCES stock_issues(issue_id),
    CONSTRAINT fk_sii_batch FOREIGN KEY (batch_id) REFERENCES stock_batches(batch_id),
    CONSTRAINT chk_sii_qty  CHECK (quantity_issued > 0)
) ENGINE=InnoDB;

CREATE TABLE stock_adjustments (
    adjustment_id    INT AUTO_INCREMENT PRIMARY KEY,
    batch_id         INT NOT NULL,
    quantity_change  INT NOT NULL,
    reason           VARCHAR(255) NOT NULL,
    adjusted_by      INT NOT NULL,
    adjusted_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sa_batch FOREIGN KEY (batch_id)    REFERENCES stock_batches(batch_id),
    CONSTRAINT fk_sa_user  FOREIGN KEY (adjusted_by) REFERENCES users(user_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 6. AUDIT
-- ------------------------------------------------------------

CREATE TABLE audit_log (
    log_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NULL,
    action      VARCHAR(100) NOT NULL,
    table_name  VARCHAR(64)  NOT NULL,
    record_id   INT NULL,
    logged_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 7. VIEW: total stock per item (derived, so it is never stored)
-- ------------------------------------------------------------

CREATE VIEW v_item_stock AS
SELECT  i.item_id,
        i.item_name,
        i.unit,
        i.reorder_level,
        COALESCE(SUM(b.quantity_remaining), 0) AS quantity_in_stock,
        CASE WHEN COALESCE(SUM(b.quantity_remaining), 0) <= i.reorder_level
             THEN 1 ELSE 0 END AS is_low_stock
FROM    items i
LEFT JOIN stock_batches b ON b.item_id = i.item_id
GROUP BY i.item_id, i.item_name, i.unit, i.reorder_level;

-- ------------------------------------------------------------
-- 8. SAMPLE DATA (for development and testing only)
--    Users are created by the application so passwords are hashed there.
-- ------------------------------------------------------------

INSERT INTO roles (role_name) VALUES
    ('Requester'), ('Store Officer'), ('Procurement Officer'), ('Administrator');

INSERT INTO departments (department_name) VALUES
    ('Department of Computer Science'),
    ('Department of Chemistry'),
    ('Faculty of Science Office'),
    ('University Health Centre');

INSERT INTO items (item_name, unit, reorder_level) VALUES
    ('A4 Printing Paper', 'ream', 50),
    ('Whiteboard Marker', 'box', 20),
    ('Toner Cartridge', 'piece', 5),
    ('Disposable Gloves', 'box', 30),
    ('Extension Cable', 'piece', 10);

INSERT INTO suppliers (supplier_name, contact_person, phone, email, address) VALUES
    ('Sample Office Supplies Ltd', 'Mr. A. Bello',  '08000000001', 'sales@sampleoffice.test', 'Ibadan, Oyo State'),
    ('Sample Lab and Medical Ltd', 'Mrs. C. Okoye', '08000000002', 'info@samplelab.test',     'Ibadan, Oyo State');

INSERT INTO supplier_items (supplier_id, item_id, unit_price) VALUES
    (1, 1, 4500.00), (1, 2, 3200.00), (1, 3, 38000.00), (1, 5, 2500.00),
    (2, 4, 6500.00);
