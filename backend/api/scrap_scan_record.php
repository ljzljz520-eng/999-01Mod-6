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
    $scanUser = $input['scan_user'] ?? null;
    $photoData = $input['photo_data'] ?? null;
    $remark = $input['remark'] ?? null;

    if (!$facode) {
        throw new Exception('缺少 facode 参数');
    }
    if (!$scanUser) {
        throw new Exception('请填写扫码人');
    }
    if (!$remark) {
        throw new Exception('请填写说明');
    }
    if (!$photoData) {
        throw new Exception('请拍照上传现场照片，拍照为必填项');
    }

    $db = new Database();
    $pdo = $db->connect();

    $stmt = $pdo->prepare("SELECT * FROM assets WHERE facode = :facode");
    $stmt->execute(['facode' => $facode]);
    $asset = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$asset) {
        throw new Exception('未找到该资产信息');
    }

    $photoPath = null;
    if ($photoData) {
        if (preg_match('/^data:image\/(\w+);base64,/', $photoData, $type)) {
            $imageType = strtolower($type[1]);
            if (!in_array($imageType, ['jpg', 'jpeg', 'png', 'gif'])) {
                throw new Exception('不支持的图片格式');
            }
            
            $photoData = substr($photoData, strpos($photoData, ',') + 1);
            $photoData = base64_decode($photoData);
            
            if ($photoData === false) {
                throw new Exception('图片数据解码失败');
            }

            $uploadDir = __DIR__ . '/../uploads/scrap_photos/';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }
            
            $fileName = $facode . '_' . time() . '.' . $imageType;
            $filePath = $uploadDir . $fileName;
            
            if (file_put_contents($filePath, $photoData)) {
                $photoPath = '/uploads/scrap_photos/' . $fileName;
            }
        } else {
            throw new Exception('无效的图片数据格式');
        }
    }

    $stmt = $pdo->prepare("
        INSERT INTO scrap_scan_records 
        (asset_id, facode, sn, scan_user, photo_path, remark)
        VALUES 
        (:asset_id, :facode, :sn, :scan_user, :photo_path, :remark)
    ");
    $stmt->execute([
        'asset_id' => $asset['id'],
        'facode' => $facode,
        'sn' => $asset['sn'],
        'scan_user' => $scanUser,
        'photo_path' => $photoPath,
        'remark' => $remark
    ]);

    $recordId = $pdo->lastInsertId();

    echo json_encode([
        'success' => true,
        'message' => '扫码记录已保存',
        'data' => [
            'record_id' => $recordId,
            'facode' => $facode,
            'photo_path' => $photoPath
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
