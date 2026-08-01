export async function writeActivityLog(action, targetType, targetId, metadata = {}) {
  // 보안 감사 로그는 클라이언트에서 신뢰할 수 없다. 서버 로깅 도입 전까지 전송하지 않는다.
  void action; void targetType; void targetId; void metadata;
}
