<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-DB-CONNECTION, X-DB-HOST, X-DB-PORT, X-DB-NAME, X-DB-USER, X-DB-PASSWORD');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/database.php';

try {
    $status = isset($_GET['status']) ? $_GET['status'] : null;

    $db = new Database();
    $pdo = $db->connect();

    $sql = "SELECT sp.*, a.asset_name, a.asset_type, a.current_value, a.purchase_amount 
            FROM scrap_process sp 
            LEFT JOIN assets a ON sp.asset_id = a.id";
    
    $params = [];
    if ($status) {
        $sql .= " WHERE sp.status = :status";
        $params['status'] = $status;
    }
    
    $sql .= " ORDER BY sp.id DESC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $list = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($list as &$item) {
        if (!empty($item['check_result'])) {
            $item['check_result'] = json_decode($item['check_result'], true);
        }
    }

    echo json_encode([
        'success' => true,
        'data' => $list
    ]);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
