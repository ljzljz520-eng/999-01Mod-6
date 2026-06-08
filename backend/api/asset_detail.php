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
    $facode = isset($_GET['facode']) ? $_GET['facode'] : (isset($_POST['facode']) ? $_POST['facode'] : null);

    if (!$facode) {
        throw new Exception('缺少 facode 参数');
    }

    $db = new Database();
    $pdo = $db->connect();

    $stmt = $pdo->prepare("SELECT * FROM assets WHERE facode = :facode");
    $stmt->execute(['facode' => $facode]);
    $asset = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$asset) {
        echo json_encode([
            'success' => true,
            'data' => null
        ]);
        exit;
    }

    $assetId = $asset['id'];

    $stmt = $pdo->prepare("SELECT * FROM borrow_records WHERE asset_id = :asset_id AND status = 'active' ORDER BY id DESC LIMIT 1");
    $stmt->execute(['asset_id' => $assetId]);
    $activeBorrow = $stmt->fetch(PDO::FETCH_ASSOC);

    $stmt = $pdo->prepare("SELECT * FROM repair_records WHERE asset_id = :asset_id ORDER BY repair_date DESC");
    $stmt->execute(['asset_id' => $assetId]);
    $repairs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $stmt = $pdo->prepare("SELECT * FROM borrow_records WHERE asset_id = :asset_id ORDER BY borrow_date DESC");
    $stmt->execute(['asset_id' => $assetId]);
    $borrowHistory = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $stmt = $pdo->prepare("SELECT * FROM scrap_process WHERE facode = :facode ORDER BY id DESC LIMIT 1");
    $stmt->execute(['facode' => $facode]);
    $scrapProcess = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($scrapProcess && !empty($scrapProcess['check_result'])) {
        $scrapProcess['check_result'] = json_decode($scrapProcess['check_result'], true);
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'asset' => $asset,
            'active_borrow' => $activeBorrow,
            'repairs' => $repairs,
            'borrow_history' => $borrowHistory,
            'scrap_process' => $scrapProcess
        ]
    ]);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
