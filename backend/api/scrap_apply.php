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

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('仅支持 POST 请求');
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $facode = $input['facode'] ?? null;
    $applicant = $input['applicant'] ?? null;
    $scrapReason = $input['scrap_reason'] ?? null;
    $checkResult = $input['check_result'] ?? null;

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
        $stmt = $pdo->prepare("SELECT * FROM assets WHERE facode = :facode");
        $stmt->execute(['facode' => $facode]);
        $asset = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$asset) {
            throw new Exception('未找到该资产信息');
        }

        if ($asset['status'] === 'scrapped') {
            throw new Exception('该资产已完成报废');
        }
        if ($asset['status'] === 'scrap_pending') {
            throw new Exception('该资产已提交报废申请，正在处理中');
        }

        $stmt = $pdo->prepare("SELECT * FROM borrow_records WHERE asset_id = :asset_id AND status = 'active'");
        $stmt->execute(['asset_id' => $asset['id']]);
        $activeBorrow = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($activeBorrow) {
            throw new Exception('资产正在借用中，不能申请报废');
        }

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
            'check_result' => $checkResult ? json_encode($checkResult) : null
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
                'applicant' => $applicant
            ]
        ]);

    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
