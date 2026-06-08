<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-DB-CONNECTION, X-DB-HOST, X-DB-PORT, X-DB-NAME, X-DB-USER, X-DB-PASSWORD');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/scrap_check_helper.php';

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('仅支持 POST 请求');
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $facode = $input['facode'] ?? null;
    $applicant = $input['applicant'] ?? null;
    $scrapReason = $input['scrap_reason'] ?? null;

    if (!$facode) {
        throw new Exception('缺少 facode 参数');
    }
    if (!$applicant) {
        throw new Exception('请填写申请人');
    }
    if (!$scrapReason) {
        throw new Exception('请填写报废原因');
    }

    $db = new Database();
    $pdo = $db->connect();

    $pdo->beginTransaction();

    try {
        $checkResult = performScrapCheck($pdo, $facode);

        if (!$checkResult['success']) {
            throw new Exception($checkResult['error']);
        }

        if (!$checkResult['can_scrap']) {
            $blockingMsg = implode('；', $checkResult['blocking_failures']);
            throw new Exception('无法提交报废申请：' . $blockingMsg);
        }

        $asset = $checkResult['asset'];
        $checkResultsJson = json_encode([
            'check_time' => date('Y-m-d H:i:s'),
            'checks' => $checkResult['checks'],
            'warnings' => $checkResult['warnings'],
            'blocking_failures' => $checkResult['blocking_failures'],
            'can_scrap' => $checkResult['can_scrap']
        ], JSON_UNESCAPED_UNICODE);

        $stmt = $pdo->prepare("
            INSERT INTO scrap_process 
            (asset_id, facode, sn, applicant, apply_date, scrap_reason, check_result, status)
            VALUES 
            (:asset_id, :facode, :sn, :applicant, CURDATE(), :scrap_reason, :check_result, 'pending_finance')
        ");
        $stmt->execute([
            'asset_id' => $asset['id'],
            'facode' => $facode,
            'sn' => $asset['sn'],
            'applicant' => $applicant,
            'scrap_reason' => $scrapReason,
            'check_result' => $checkResultsJson
        ]);

        $scrapProcessId = $pdo->lastInsertId();

        $stmt = $pdo->prepare("UPDATE assets SET status = 'scrap_pending' WHERE id = :id");
        $stmt->execute(['id' => $asset['id']]);

        $pdo->commit();

        echo json_encode([
            'success' => true,
            'message' => '报废申请已提交，等待财务确认',
            'data' => [
                'scrap_process_id' => $scrapProcessId,
                'facode' => $facode,
                'status' => 'pending_finance',
                'applicant' => $applicant,
                'check_result' => [
                    'warnings' => $checkResult['warnings'],
                    'blocking_failures' => $checkResult['blocking_failures']
                ]
            ]
        ], JSON_UNESCAPED_UNICODE);

    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
