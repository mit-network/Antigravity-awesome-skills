$ErrorActionPreference = "Stop"

$logDir = "logs"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = "$logDir\verify_prod_$timestamp.log"

function Write-Log {
    param([string]$message, [switch]$isError)
    $text = "[$(Get-Date -Format 'HH:mm:ss')] $message"
    Add-Content -Path $logFile -Value $text
    if ($isError) { Write-Host $text -ForegroundColor Red }
    else { Write-Host $text }
}

Write-Log "Starting Production Verification..."

$baseUrl = "https://residencysolutions.netlify.app"

$endpoints = @(
    @{ Name = "sc-health"; Url = "$baseUrl/.netlify/functions/sc-health" },
    @{ Name = "sc-official-search"; Url = "$baseUrl/.netlify/functions/sc-official-search?q=ambient" },
    # Use a real URL for resolve on prod instead of a fixture
    @{ Name = "sc-official-resolve"; Url = "$baseUrl/.netlify/functions/sc-official-resolve?url=https://soundcloud.com/tycho/awake" }
)

$hasError = $false

foreach ($ep in $endpoints) {
    Write-Log "Checking target: $($ep.Name) -> $($ep.Url)"
    try {
        $response = Invoke-WebRequest -Uri $ep.Url -UseBasicParsing -ErrorAction Stop
        Write-Log "HTTP $($response.StatusCode)"
        $snippet = $response.Content
        if ($snippet.Length -gt 150) { $snippet = $snippet.Substring(0, 150) + "..." }
        Write-Log "Response: $snippet"
    }
    catch {
        Write-Log "Request Failed: $($_.Exception.Message)" -isError
        if ($_.ErrorDetails) { Write-Log "Details: $($_.ErrorDetails.Message)" -isError }
        $hasError = $true
    }
}

if ($hasError) {
    Write-Log ""
    Write-Log "RESULT: FAIL" -isError
    exit 1
}
else {
    Write-Log ""
    Write-Log "RESULT: PASS"
    exit 0
}
