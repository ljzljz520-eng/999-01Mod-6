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
require_once __DIR__ . '/../includes/scrap_check_helper.php';

try {
    $facode = isset($_GET['facode']) ? $_GET['facode'] : (isset($_POST['facode']) ? $_POST['facode'] : null);

    if (!$facode) {
        throw new Exception('缺少 facode 参数');
    }

    $db = new Database();
    $pdo = $db->connect();

    $checkResult = performScrapCheck($pdo, $facode);

    if (!$checkResult['success']) {
        throw new Exception($checkResult['error']);
    }

    $asset = $checkResult['asset'];
    $checkResults = $checkResult['checks'];
    $canScrap = $checkResult['can_scrap'];
    $warnings = $checkResult['warnings'];
    $blockingFailures = $checkResult['blocking_failures'];
    $summary = $checkResult['summary'];

    echo json_encode([
        'success' => true,
        'data' => [
            'asset' => [
                'id' => $asset['id'],
                'facode' => $asset['facode'],
                'sn' => $asset['sn'],
                'asset_name' => $asset['asset_name'],
                'status' => $asset['status']
            ],
            'checks' => $checkResults,
            'can_scrap' => $canScrap,
            'warnings' => $warnings,
            'blocking_failures' => $blockingFailures,
            'summary' => $summary
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
