# EPER six-family local HTTP UAT smoke (PowerShell)
# Run only against a container bound to 127.0.0.1:18080 with the local capability API enabled.
# This is technical smoke evidence, NOT business UAT or acceptance of the 228 requirements.
[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:18080",
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$EvidencePath = ".\EPER-SIX-FAMILY-HTTP-SMOKE.json"
)
$ErrorActionPreference = "Stop"
if ($Token.Length -lt 32) { throw "Token must be at least 32 characters." }
$headers = @{ Authorization = "Bearer $Token" }
$now = [DateTime]::UtcNow.ToString("o")
$cases = @(
  @{ Pattern = "XX01"; Requirement = "REQ-46301"; Payload = @{ operation="create"; record=@{ id="uat-record-1"; version=1; state="OPEN"; data=@{ test=$true } } }; Check = { param($d) if ($d.operation -ne "create" -or $d.record.id -ne "uat-record-1" -or $d.record.tenantId -ne "uat-test-tenant") { throw "XX01 record assertion failed" } } },
  @{ Pattern = "XX02"; Requirement = "REQ-46302"; Payload = @{ operation="decide"; request=@{ tenantId="uat-test-tenant"; principalId="uat-test-operator"; action="read"; resource="uat-resource" } }; Check = { param($d) if ($d.operation -ne "decide" -or $d.decision.effect -ne "DENY") { throw "XX02 default-deny assertion failed" } } },
  @{ Pattern = "XX03"; Requirement = "REQ-46303"; Payload = @{ operation="validate"; input=@{ accepted=$true } }; Check = { param($d) if ($d.operation -ne "validate" -or $d.validation.valid -ne $true) { throw "XX03 validation assertion failed" } } },
  @{ Pattern = "XX04"; Requirement = "REQ-46304"; Payload = @{ operation="append"; evidence=@{ id="uat-evidence-1"; tenantId="uat-test-tenant"; requirementId="REQ-46304"; action="UAT_TEST"; principalId="uat-test-operator"; correlationId="uat-correlation-4"; occurredAt=$now; payload=@{ test=$true } } }; Check = { param($d) if ($d.operation -ne "append" -or $d.evidence.integrityHash -notmatch '^[a-f0-9]{64}$') { throw "XX04 evidence hash assertion failed" } } },
  @{ Pattern = "XX05"; Requirement = "REQ-46305"; Payload = @{ operation="create"; exception=@{ id="uat-exception-1"; tenantId="uat-test-tenant"; requirementId="REQ-46305"; code="UAT_TEST"; message="Six-family HTTP exercise"; idempotencyKey="uat-idempotency-5"; createdAt=$now } }; Check = { param($d) if ($d.operation -ne "create" -or $d.exception.state -ne "OPEN") { throw "XX05 exception assertion failed" } } },
  @{ Pattern = "XX06"; Requirement = "REQ-46306"; Payload = @{ operation="publish"; row=@{ tenantId="uat-test-tenant"; reportId="uat-report-1"; values=@{ test=$true }; sourceRequirementIds=@("REQ-46306"); generatedAt=$now } }; Check = { param($d) if ($d.operation -ne "publish" -or $d.published -ne $true) { throw "XX06 report assertion failed" } } }
)
$results = [System.Collections.Generic.List[object]]::new()
foreach ($case in $cases) {
  $body = @{ payload = $case.Payload } | ConvertTo-Json -Depth 20
  try {
    $response = Invoke-RestMethod -Method Post -Uri "$BaseUrl/internal/requirements/$($case.Requirement)/execute" -Headers $headers -ContentType "application/json" -Body $body
    if ($response.result.requirementId -ne $case.Requirement -or $response.result.pattern -ne $case.Pattern -or $response.result.status -ne "EXECUTED") {
      throw "Unexpected envelope: $($response | ConvertTo-Json -Depth 20 -Compress)"
    }
    & $case.Check $response.result.data.payload
    $results.Add([pscustomobject]@{ requirementId=$case.Requirement; pattern=$case.Pattern; httpStatus=200; result="PASS"; operation=$case.Payload.operation })
    Write-Host "PASS $($case.Requirement) $($case.Pattern)"
  } catch {
    $results.Add([pscustomobject]@{ requirementId=$case.Requirement; pattern=$case.Pattern; httpStatus=$null; result="FAIL"; error=$_.Exception.Message })
    $results | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 $EvidencePath
    throw
  }
}
$evidence = [pscustomobject]@{
  evidenceType = "LOCAL_TECHNICAL_SMOKE_NOT_BUSINESS_UAT"
  capturedAtUtc = [DateTime]::UtcNow.ToString("o")
  baseUrl = $BaseUrl
  buildId = (Invoke-RestMethod -Method Get -Uri "$BaseUrl/health").buildId
  total = $results.Count
  passed = @($results | Where-Object result -eq "PASS").Count
  failed = @($results | Where-Object result -eq "FAIL").Count
  results = @($results)
}
$evidence | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 $EvidencePath
if ($evidence.passed -ne 6 -or $evidence.failed -ne 0) { throw "Six-family smoke did not fully pass." }
Write-Host "PASS: all six capability families. Evidence: $EvidencePath"
Write-Host "Build ID: $($evidence.buildId)"
Write-Host "Boundary: technical smoke only; no requirement acceptance or business UAT."
