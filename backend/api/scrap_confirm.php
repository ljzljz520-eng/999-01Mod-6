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
    $scrapProcessId = $input['scrap_process_id'] ?? null;
    $action = $input['action'] ?? null;
    $confirmBy = $input['confirm_by'] ?? null;
    $remark = $input['remark'] ?? null;

    if (!$scrapProcessId) {
        throw new Exception('缺少报废流程ID');
    }
    if (!$action) {
        throw new Exception('缺少操作类型');
    }
    if (!in_array($action, ['approve', 'reject'])) {
        throw new Exception('无效的操作类型');
    }
    if (!$confirmBy) {
        throw new Exception('请填写确认人');
    }

    $db = new Database();
    $pdo = $db->connect();

    $pdo->beginTransaction();

    try {
        $stmt = $pdo->prepare("SELECT * FROM scrap_process WHERE id = :id");
        $stmt->execute(['id' => $scrapProcessId]);
        $scrapProcess = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$scrapProcess) {
            throw new Exception('未找到该报废流程');
        }

        if ($scrapProcess['status'] !== 'pending_finance') {
            throw new Exception('该流程状态不允许确认');
        }

        if ($action === 'approve') {
            $stmt = $pdo->prepare("
                UPDATE scrap_process 
                SET status = 'finance_approved', 
                    finance_confirm_by = :confirm_by, 
                    finance_confirm_date = CURDATE(),
                    finance_remark = :remark
                WHERE id = :id
            ");
            $stmt->execute([
                'id' => $scrapProcessId,
                'confirm_by' => $confirmBy,
                'remark' => $remark
            ]);

            $stmt = $pdo->prepare("UPDATE assets SET status = 'scrapped' WHERE id = :id");
            $stmt->execute(['id' => $scrapProcess['asset_id']]);

            $stmt = $pdo->prepare("
                UPDATE scrap_process 
                SET status = 'completed', 
                    scrap_complete_date = CURDATE()
                WHERE id = :id
            ");
            $stmt->execute(['id' => $scrapProcessId]);

            $message = '财务确认通过，资产已完成报废';
            $newStatus = 'completed';

        } else {
            $stmt = $pdo->prepare("
                UPDATE scrap_process 
                SET status = 'finance_rejected', 
                    finance_confirm_by = :confirm_by, 
                    finance_confirm_date = CURDATE(),
                    finance_remark = :remark
                WHERE id = :id
            ");
            $stmt->execute([
                'id' => $scrapProcessId,
                'confirm_by' => $confirmBy,
                'remark' => $remark
            ]);

            $stmt = $pdo->prepare("UPDATE assets SET status = 'in_use' WHERE id = :id");
            $stmt->execute(['id' => $scrapProcess['asset_id']]);

            $message = '财务已拒绝报废申请，资产状态已恢复';
            $newStatus = 'finance_rejected';
        }

        $pdo->commit();

        echo json_encode([
            'success' => true,
            'message' => $message,
            'data' => [
                'scrap_process_id' => $scrapProcessId,
                'facode' => $scrapProcess['facode'],
                'status' => $newStatus
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
