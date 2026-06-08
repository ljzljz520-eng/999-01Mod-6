<?php

function performScrapCheck($pdo, $facode) {
    $stmt = $pdo->prepare("SELECT * FROM assets WHERE facode = :facode");
    $stmt->execute(['facode' => $facode]);
    $asset = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$asset) {
        return [
            'success' => false,
            'error' => '未找到该资产信息'
        ];
    }

    $assetId = $asset['id'];
    $checkResults = [];
    $canScrap = true;
    $warnings = [];
    $blockingFailures = [];

    if ($asset['status'] === 'scrapped') {
        $canScrap = false;
        $warnings[] = '该资产已完成报废，请勿重复操作';
        $blockingFailures[] = '该资产已完成报废';
    }
    if ($asset['status'] === 'scrap_pending') {
        $canScrap = false;
        $warnings[] = '该资产已提交报废申请，正在等待财务确认';
        $blockingFailures[] = '该资产已在报废流程中';
    }

    $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM facode2sn WHERE facode = :facode AND sn = :sn");
    $stmt->execute(['facode' => $facode, 'sn' => $asset['sn']]);
    $snMatch = $stmt->fetch(PDO::FETCH_ASSOC);
    $snValid = $snMatch['cnt'] > 0 && !empty($asset['sn']);
    
    $checkResults['serial_number'] = [
        'passed' => $snValid,
        'blocking' => true,
        'sn' => $asset['sn'],
        'message' => $snValid ? '序列号有效' : '序列号无效或不匹配'
    ];
    if (!$snValid) {
        $canScrap = false;
        $warnings[] = '序列号验证失败，无法进行报废';
        $blockingFailures[] = '序列号验证失败';
    }

    $purchaseDate = new DateTime($asset['purchase_date']);
    $today = new DateTime();
    $usageYears = $purchaseDate->diff($today)->y + ($purchaseDate->diff($today)->m / 12);
    $depreciationMonths = $asset['depreciation_months'];
    $usageMonths = $purchaseDate->diff($today)->y * 12 + $purchaseDate->diff($today)->m;
    
    $checkResults['purchase_date'] = [
        'passed' => true,
        'blocking' => false,
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

    $depreciationStatus = $asset['depreciation_status'];
    $currentValue = floatval($asset['current_value']);
    $purchaseAmount = floatval($asset['purchase_amount']);
    
    $depreciationPassed = true;
    $depreciationMessage = '';
    $isDepreciationBlocking = false;
    
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
            $isDepreciationBlocking = true;
            $warnings[] = '资产仍在正常折旧期内，原则上不建议报废';
            $blockingFailures[] = '资产仍在正常折旧期内';
            break;
    }
    
    $checkResults['depreciation'] = [
        'passed' => $depreciationPassed,
        'blocking' => $isDepreciationBlocking,
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
    if (!$depreciationPassed && $isDepreciationBlocking) {
        $canScrap = false;
    }

    $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM repair_records WHERE asset_id = :asset_id");
    $stmt->execute(['asset_id' => $assetId]);
    $actualRepairCount = intval($stmt->fetch(PDO::FETCH_ASSOC)['cnt']);
    
    $repairThreshold = 3;
    $repairPassed = $actualRepairCount >= $repairThreshold;
    
    $checkResults['repair_count'] = [
        'passed' => $repairPassed,
        'blocking' => false,
        'count' => $actualRepairCount,
        'threshold' => $repairThreshold,
        'message' => $repairPassed 
            ? sprintf('维修次数 %d 次，达到报废阈值 %d 次', $actualRepairCount, $repairThreshold)
            : sprintf('维修次数 %d 次，未达到报废阈值 %d 次', $actualRepairCount, $repairThreshold)
    ];
    if (!$repairPassed) {
        $warnings[] = sprintf('维修次数不足 %d 次，建议继续使用', $repairThreshold);
    }

    $stmt = $pdo->prepare("SELECT * FROM borrow_records WHERE asset_id = :asset_id AND status = 'active' ORDER BY id DESC LIMIT 1");
    $stmt->execute(['asset_id' => $assetId]);
    $activeBorrow = $stmt->fetch(PDO::FETCH_ASSOC);
    
    $borrowPassed = !$activeBorrow;
    
    $checkResults['borrow_status'] = [
        'passed' => $borrowPassed,
        'blocking' => true,
        'is_borrowed' => !$borrowPassed,
        'borrow_info' => $activeBorrow,
        'message' => $borrowPassed 
            ? '资产未被借用，可正常报废'
            : sprintf('资产正在被 %s 借用中 (自 %s 起)', $activeBorrow['borrower'], $activeBorrow['borrow_date'])
    ];
    if (!$borrowPassed) {
        $canScrap = false;
        $warnings[] = '资产正在借用中，必须先归还才能报废';
        $blockingFailures[] = '资产正在借用中';
    }

    return [
        'success' => true,
        'asset' => $asset,
        'checks' => $checkResults,
        'can_scrap' => $canScrap,
        'warnings' => $warnings,
        'blocking_failures' => $blockingFailures,
        'summary' => $canScrap 
            ? (empty($warnings) ? '所有检查项通过，可以进行报废' : '基本条件满足，但存在以下注意事项')
            : '存在阻止报废的问题，请先解决'
    ];
}
