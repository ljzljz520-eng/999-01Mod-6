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
            'data' => [
                'is_scrapped' => false,
                'asset_found' => false,
                'risk_level' => 'none',
                'message' => '未找到该资产信息'
            ]
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $isScrapped = $asset['status'] === 'scrapped';
    $riskLevel = $isScrapped ? 'high' : 'none';

    $scrapInfo = null;
    if ($isScrapped) {
        $stmt = $pdo->prepare("SELECT * FROM scrap_process WHERE facode = :facode AND status = 'completed' ORDER BY id DESC LIMIT 1");
        $stmt->execute(['facode' => $facode]);
        $scrapInfo = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($scrapInfo && !empty($scrapInfo['check_result'])) {
            $scrapInfo['check_result'] = json_decode($scrapInfo['check_result'], true);
        }

        $stmt = $pdo->prepare("SELECT * FROM scrap_scan_records WHERE facode = :facode ORDER BY scan_time DESC LIMIT 5");
        $stmt->execute(['facode' => $facode]);
        $scanHistory = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $scanHistory = [];
    }

    $message = $isScrapped 
        ? '⚠️ 风险提醒：该设备已报废！请勿使用或流转。请拍照说明扫码原因。'
        : '设备状态正常，可正常使用';

    echo json_encode([
        'success' => true,
        'data' => [
            'asset' => [
                'id' => $asset['id'],
                'facode' => $asset['facode'],
                'sn' => $asset['sn'],
                'asset_name' => $asset['asset_name'],
                'status' => $asset['status'],
                'status_text' => [
                    'in_use' => '使用中',
                    'borrowed' => '借用中',
                    'idle' => '闲置',
                    'scrap_pending' => '待报废',
                    'scrapped' => '已报废'
                ][$asset['status']] ?? $asset['status']
            ],
            'is_scrapped' => $isScrapped,
            'asset_found' => true,
            'risk_level' => $riskLevel,
            'message' => $message,
            'scrap_info' => $scrapInfo,
            'scan_history' => $scanHistory ?? []
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
