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
        throw new Exception('未找到该资产信息');
    }

    $assetId = $asset['id'];
    $checkResults = [];
    $canScrap = true;
    $warnings = [];

    // 1. 序列号检查
    $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM facode2sn WHERE facode = :facode AND sn = :sn");
    $stmt->execute(['facode' => $facode, 'sn' => $asset['sn']]);
    $snMatch = $stmt->fetch(PDO::FETCH_ASSOC);
    $snValid = $snMatch['cnt'] > 0 && !empty($asset['sn']);
    
    $checkResults['serial_number'] = [
        'passed' => $snValid,
        'sn' => $asset['sn'],
        'message' => $snValid ? '序列号有效' : '序列号无效或不匹配'
    ];
    if (!$snValid) {
        $canScrap = false;
        $warnings[] = '序列号验证失败，无法进行报废';
    }

    // 2. 采购日期检查
    $purchaseDate = new DateTime($asset['purchase_date']);
    $today = new DateTime();
    $usageYears = $purchaseDate->diff($today)->y + ($purchaseDate->diff($today)->m / 12);
    $depreciationMonths = $asset['depreciation_months'];
    $usageMonths = $purchaseDate->diff($today)->y * 12 + $purchaseDate->diff($today)->m;
    
    $checkResults['purchase_date'] = [
        'passed' => true,
        'purchase_date' => $asset['purchase_date'],
        'usage_years' => round($usageYears, 2),
        'usage_months' => $usageMonths,
        'depreciation_months' => $depreciationMonths,
        'message' => sprintf('已使用 %.1f 年 (%d 个月)，折旧年限 %d 个月', $usageYears, $usageMonths, $depreciationMonths)
    ];
    if ($usageMonths < $depreciationMonths) {
        $remainingMonths = $depreciationMonths - $usageMonths;
        $warnings[] = sprintf('资产尚未折旧完毕，仍剩余 %d 个月折旧期', $remainingMonths);
    }

    // 3. 折旧状态检查
    $depreciationStatus = $asset['depreciation_status'];
    $currentValue = floatval($asset['current_value']);
    $purchaseAmount = floatval($asset['purchase_amount']);
    
    $depreciationPassed = true;
    $depreciationMessage = '';
    
    switch ($depreciationStatus) {
        case 'fully_depreciated':
            $depreciationMessage = '已完全折旧，净值为0，适合报废';
            break;
        case 'partial':
            $depreciationMessage = sprintf('部分折旧，当前净值 %.2f 元 (原值 %.2f 元)', $currentValue, $purchaseAmount);
            $warnings[] = '资产尚未完全折旧，报废需财务特别审批';
            break;
        case 'normal':
        default:
            $depreciationMessage = sprintf('正常折旧中，当前净值 %.2f 元 (原值 %.2f 元)', $currentValue, $purchaseAmount);
            $depreciationPassed = false;
            $warnings[] = '资产仍在正常折旧期内，原则上不建议报废';
            break;
    }
    
    $checkResults['depreciation'] = [
        'passed' => $depreciationPassed,
        'status' => $depreciationStatus,
        'status_text' => [
            'normal' => '正常折旧中',
            'partial' => '部分折旧',
            'fully_depreciated' => '已完全折旧'
        ][$depreciationStatus] ?? $depreciationStatus,
        'current_value' => $currentValue,
        'purchase_amount' => $purchaseAmount,
        'message' => $depreciationMessage
    ];

    // 4. 维修次数检查
    $repairCount = intval($asset['repair_count']);
    $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM repair_records WHERE asset_id = :asset_id");
    $stmt->execute(['asset_id' => $assetId]);
    $actualRepairCount = intval($stmt->fetch(PDO::FETCH_ASSOC)['cnt']);
    
    $repairThreshold = 3;
    $repairPassed = $actualRepairCount >= $repairThreshold;
    
    $checkResults['repair_count'] = [
        'passed' => $repairPassed,
        'count' => $actualRepairCount,
        'threshold' => $repairThreshold,
        'message' => $repairPassed 
            ? sprintf('维修次数 %d 次，达到报废阈值 %d 次', $actualRepairCount, $repairThreshold)
            : sprintf('维修次数 %d 次，未达到报废阈值 %d 次', $actualRepairCount, $repairThreshold)
    ];
    if (!$repairPassed) {
        $warnings[] = sprintf('维修次数不足 %d 次，建议继续使用', $repairThreshold);
    }

    // 5. 借用状态检查
    $stmt = $pdo->prepare("SELECT * FROM borrow_records WHERE asset_id = :asset_id AND status = 'active' ORDER BY id DESC LIMIT 1");
    $stmt->execute(['asset_id' => $assetId]);
    $activeBorrow = $stmt->fetch(PDO::FETCH_ASSOC);
    
    $borrowPassed = !$activeBorrow;
    
    $checkResults['borrow_status'] = [
        'passed' => $borrowPassed,
        'is_borrowed' => !$borrowPassed,
        'borrow_info' => $activeBorrow,
        'message' => $borrowPassed 
            ? '资产未被借用，可正常报废'
            : sprintf('资产正在被 %s 借用中 (自 %s 起)', $activeBorrow['borrower'], $activeBorrow['borrow_date'])
    ];
    if (!$borrowPassed) {
        $canScrap = false;
        $warnings[] = '资产正在借用中，必须先归还才能报废';
    }

    // 检查资产当前状态
    if ($asset['status'] === 'scrapped') {
        $canScrap = false;
        $warnings[] = '该资产已完成报废，请勿重复操作';
    }
    if ($asset['status'] === 'scrap_pending') {
        $canScrap = false;
        $warnings[] = '该资产已提交报废申请，正在等待财务确认';
    }

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
            'summary' => $canScrap 
                ? (empty($warnings) ? '所有检查项通过，可以进行报废' : '基本条件满足，但存在以下注意事项')
                : '存在阻止报废的问题，请先解决'
        ]
    ]);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
