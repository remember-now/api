#!/bin/bash

# Anti-flaky test runner
# Runs unit tests once, then e2e tests N times to detect flakiness

# Default number of e2e test runs
RUNS=${1:-15}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

format_time() {
    local total_seconds=$1
    local minutes=$((total_seconds / 60))
    local seconds=$((total_seconds % 60))
    echo "${minutes}m ${seconds}s"
}

check_for_failures() {
    local output="$1"
    local run_num="$2"

    if echo "$output" | grep -q "FAIL"; then
        echo -e "${RED}❌ Run $run_num: Found FAIL in output${NC}"
        echo "$output" | grep "FAIL"
        return 1
    fi

    if echo "$output" | grep -q "worker process has failed to exit gracefully"; then
        echo -e "${RED}❌ Run $run_num: Found graceful shutdown warning${NC}"
        echo "$output" | grep "worker process"
        return 1
    fi

    if echo "$output" | grep -q "failed,"; then
        echo -e "${RED}❌ Run $run_num: Test suite reported failures${NC}"
        echo "$output" | grep -E "Test Suites:|Tests:"
        return 1
    fi
    return 0
}

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}    🧪  Anti-Flaky Test Runner  🧪${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}[1/3] Running unit tests...${NC}"
UNIT_OUTPUT=$(npm test 2>&1)
UNIT_EXIT=$?

if [ $UNIT_EXIT -ne 0 ]; then
    echo -e "${RED}❌ Unit tests failed!${NC}"
    echo ""
    echo "$UNIT_OUTPUT"
    exit 1
fi

if echo "$UNIT_OUTPUT" | grep -q "FAIL"; then
    echo -e "${RED}❌ Unit tests contain failures!${NC}"
    echo "$UNIT_OUTPUT" | grep "FAIL"
    exit 1
fi

echo -e "${GREEN}✅ Unit tests passed!${NC}"
echo ""

echo -e "${YELLOW}[2/3] Setting up test infrastructure...${NC}"
npm run infra:test:reset > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to set up test infrastructure${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Test infrastructure ready${NC}"
echo ""

cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up test infrastructure...${NC}"
    npm run infra:test:rm > /dev/null 2>&1
    echo -e "${YELLOW}Exiting...${NC}"
}
trap cleanup EXIT

echo -e "${YELLOW}[3/3] Running e2e tests ${RUNS} times...${NC}"
echo ""

# Calculate width for run numbers based on RUNS
if [ $RUNS -lt 10 ]; then
    WIDTH=1
elif [ $RUNS -lt 100 ]; then
    WIDTH=2
else
    WIDTH=3
fi

START_TIME=$(date +%s)
COMPLETED=0

for i in $(seq 1 $RUNS); do
    RUN_START=$(date +%s)

    E2E_OUTPUT=$(npm run test:e2e:base 2>&1)
    E2E_EXIT=$?

    RUN_END=$(date +%s)
    RUN_DURATION=$((RUN_END - RUN_START))

    if ! check_for_failures "$E2E_OUTPUT" "$i/$RUNS"; then
        echo ""
        exit 1
    fi

    if [ $E2E_EXIT -ne 0 ]; then
        echo -e "${RED}❌ Run $i/$RUNS: E2E tests exited with code $E2E_EXIT${NC}"
        echo ""
        echo "$E2E_OUTPUT" | tail -20
        exit 1
    fi

    COMPLETED=$((COMPLETED + 1))

    # Calculate ETA
    TOTAL_ELAPSED=$(($(date +%s) - START_TIME))
    AVG_TIME=$((TOTAL_ELAPSED / COMPLETED))
    REMAINING=$((RUNS - COMPLETED))
    ETA_SECONDS=$((REMAINING * AVG_TIME))

    # Progress bar
    PERCENT=$((COMPLETED * 100 / RUNS))
    FILLED=$((PERCENT / 5))
    EMPTY=$((20 - FILLED))
    BAR=$(printf "%${FILLED}s" | tr ' ' '=')
    EMPTY_BAR=$(printf "%${EMPTY}s" | tr ' ' '-')

    # Format ETA
    ETA_MINUTES=$((ETA_SECONDS / 60))
    ETA_SECONDS_REMAINDER=$((ETA_SECONDS % 60))

    printf "${GREEN}✅${NC} Run %${WIDTH}d/%${WIDTH}d [%s%s] %3d%% | %2ds | ETA: %2dm %2ds\n" \
        $i $RUNS "$BAR" "$EMPTY_BAR" $PERCENT $RUN_DURATION $ETA_MINUTES $ETA_SECONDS_REMAINDER
done

TOTAL_TIME=$(($(date +%s) - START_TIME))
TOTAL_TIME_FORMATTED=$(format_time $TOTAL_TIME)

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   SUCCESS! All $RUNS runs passed.${NC}"
echo -e "${GREEN}     No flakiness detected.${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Stats:"
echo "Total runs: $RUNS"
echo "Total time: $TOTAL_TIME_FORMATTED"
echo "Avg time per run: $((TOTAL_TIME / RUNS))s"
