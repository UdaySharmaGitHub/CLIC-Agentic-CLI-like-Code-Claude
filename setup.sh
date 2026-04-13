#!/bin/bash
#             CLIC ---------> Agentic CLI v4.0 + Role-Based Agents (Knowledge Base)
# ─────────────────────────────────────────────────────────────────────────────
#  🤖  Generic CLI AI Agent v4.1  —  Powered by Google Gemini 2.5 Flash
#
#  Capabilities:
#    💬 Chat / Q&A          —  Any topic: coding, math, devops, science
#    ⚙️  Run Commands        —  Execute safe shell commands with approval
#    📖 Read Files           —  Display & analyze file contents
#    ✏️  Write Files         —  Create / overwrite files
#    ➕ Append Files         —  Add content to existing files
#    🔧 Modify Files         —  Find-and-replace text in files
#    📂 List Directories     —  Browse the filesystem
#    🌐 Web Search           —  Search the web via Google Search grounding
#    🔗 Agentic Loop         —  Chain multiple steps automatically
#    📚 Knowledge Base       —  Load role/behavior from a file (optional)
#
#  Usage:  chmod +x setup.sh && ./setup.sh
#  Toggle debug JSON output any time by typing:  raw
# ─────────────────────────────────────────────────────────────────────────────

# ── Colors ───────────────────────────────────────────────────────────────────
BOLD='\033[1m';   DIM='\033[2m';      CYAN='\033[0;36m'
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; MAGENTA='\033[0;35m'
RED='\033[0;31m'; BLUE='\033[0;34m';  WHITE='\033[1;37m'
RESET='\033[0m'

# ── Agent Config ─────────────────────────────────────────────────────────────
HISTORY_FILE="${AGENT_HISTORY_FILE:-chat_history.json}"
MAX_AGENT_STEPS=10
GEMINI_MODEL="gemini-2.5-flash"
API_URL="https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent"
SHOW_RAW=false

# ── Knowledge Base (set after user input) ────────────────────────────────────
ROLE_KNOWLEDGE=""

# ── Temp file — KEY DESIGN: execute_action writes result here instead of
#    using stdout, so all echo/print commands display freely on the terminal.
RESULT_TMP=$(mktemp /tmp/agent_result.XXXXXX)
trap 'rm -f "$RESULT_TMP"' EXIT

# ── Safety: Blocked command patterns ─────────────────────────────────────────
BLOCKED_COMMANDS=(
  "rm -rf /"   "rm -rf /*"   "mkfs"        "dd if="
  ":(){:|:&};:"  "fork bomb"  "> /dev/sda"
  "chmod -R 777 /"  "chown -R"  "shutdown"
  "reboot"     "halt"        "init 0"      "init 6"
  "kill -9 1"  "mv /* "
  "curl.*| bash"  "curl.*| sh"  "wget.*| bash"
  "poweroff"
)

# ── Safety: Protected file paths ─────────────────────────────────────────────
PROTECTED_PATHS=(
  "/etc/passwd"  "/etc/shadow"  "/etc/sudoers"
  "/etc/hosts"   "/boot/"       "/dev/"
  "/proc/"       "/sys/"        "/var/log/auth"
)

# ─────────────────────────────────────────────────────────────────────────────
#  UI Helpers
# ─────────────────────────────────────────────────────────────────────────────

print_banner() {
  clear
  echo ""

  # ── Animated-style intro (Claude Code inspired) ──────────────────────────
  echo -e "${BOLD}${WHITE}"
  echo "   ██████╗██╗     ██╗ ██████╗"
  echo "  ██╔════╝██║     ██║██╔════╝"
  echo "  ██║     ██║     ██║██║     "
  echo "  ██║     ██║     ██║██║     "
  echo "  ╚██████╗███████╗██║╚██████╗"
  echo "   ╚═════╝╚══════╝╚═╝ ╚═════╝"
  echo -e "${RESET}"
  echo -e "  ${CYAN}${BOLD}CLIC${RESET} ${DIM}v4.1${RESET}  ${DIM}—${RESET}  ${WHITE}Command Line Intelligence Companion${RESET}"
  echo -e "  ${DIM}Powered by Google Gemini 2.5 Flash${RESET}"
  echo ""
  echo -e "  ${BLUE}${BOLD}🧠 Capabilities:${RESET}"
  echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
  echo -e "  ${WHITE}  💬 Chat / Q&A${RESET}       │  Any topic — code, math, devops, science"
  echo -e "  ${WHITE}  ⚙️  Run Commands${RESET}     │  Execute safe shell commands"
  echo -e "  ${WHITE}  📖 Read Files${RESET}        │  Read and analyze file contents"
  echo -e "  ${WHITE}  ✏️  Write Files${RESET}      │  Create or overwrite files"
  echo -e "  ${WHITE}  ➕ Append Files${RESET}      │  Add content to existing files"
  echo -e "  ${WHITE}  🔧 Modify Files${RESET}      │  Find-and-replace text in files"
  echo -e "  ${WHITE}  📂 List Dirs${RESET}         │  Browse directory listings"
  echo -e "  ${WHITE}  🌐 Web Search${RESET}        │  Search the web for real-time info"
  echo -e "  ${WHITE}  🔗 Agentic Loop${RESET}      │  Auto-chain: plan → execute → verify"
  echo -e "  ${WHITE}  📚 Knowledge Base${RESET}    │  Load role/behavior from a file"
  echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
  echo ""

  # ── Capabilities (compact, Claude-style) ─────────────────────────────────
  echo -e "  ${GREEN}${BOLD}Tools:${RESET} ${DIM}chat${RESET} ${DIM}·${RESET} ${DIM}commands${RESET} ${DIM}·${RESET} ${DIM}read${RESET} ${DIM}·${RESET} ${DIM}write${RESET} ${DIM}·${RESET} ${DIM}append${RESET} ${DIM}·${RESET} ${DIM}modify${RESET} ${DIM}·${RESET} ${DIM}list${RESET} ${DIM}·${RESET} ${DIM}web search${RESET} ${DIM}·${RESET} ${DIM}knowledge base${RESET}"
  echo ""
  echo -e "  ${YELLOW}${BOLD}Commands:${RESET} ${DIM}exit${RESET} ${DIM}·${RESET} ${DIM}clear${RESET} ${DIM}·${RESET} ${DIM}history${RESET} ${DIM}·${RESET} ${DIM}status${RESET} ${DIM}·${RESET} ${DIM}help${RESET} ${DIM}·${RESET} ${DIM}raw${RESET}"
  echo ""
}

show_help() {
  echo ""
  echo -e "${BLUE}${BOLD}  🧠 Capabilities:${RESET}"
  echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
  echo -e "  ${WHITE}  💬 Chat / Q&A${RESET}       │  Any topic"
  echo -e "  ${WHITE}  ⚙️  Run Commands${RESET}     │  Safe shell commands with approval"
  echo -e "  ${WHITE}  📖 Read Files${RESET}        │  Read and analyze file contents"
  echo -e "  ${WHITE}  ✏️  Write Files${RESET}      │  Create or overwrite files"
  echo -e "  ${WHITE}  ➕ Append Files${RESET}      │  Add content to existing files"
  echo -e "  ${WHITE}  🔧 Modify Files${RESET}      │  Find-and-replace text in files"
  echo -e "  ${WHITE}  📂 List Dirs${RESET}         │  Browse directory listings"
  echo -e "  ${WHITE}  🌐 Web Search${RESET}        │  Search the web for real-time info"
  echo -e "  ${WHITE}  🔗 Agentic Loop${RESET}      │  Auto-chains steps until task done"
  echo -e "  ${WHITE}  📚 Knowledge Base${RESET}    │  Role/behavior loaded from file"
  echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
  echo ""
  echo -e "  ${YELLOW}${BOLD}⚡ CLI Commands:${RESET}"
  echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
  echo -e "  ${MAGENTA}  exit${RESET}      │  Quit the agent"
  echo -e "  ${MAGENTA}  clear${RESET}     │  Clear chat history"
  echo -e "  ${MAGENTA}  history${RESET}   │  Show conversation history"
  echo -e "  ${MAGENTA}  status${RESET}    │  Show system info"
  echo -e "  ${MAGENTA}  raw${RESET}       │  Toggle raw JSON debug output"
  echo -e "  ${MAGENTA}  help${RESET}      │  Show this menu"
  echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
  echo ""
  echo -e "  ${BLUE}${BOLD}💡 Example multi-step prompts:${RESET}"
  echo -e "  ${DIM}  • \"what is the difference between TCP and UDP?\"${RESET}"
  echo -e "  ${DIM}  • \"list all python files in current directory\"${RESET}"
  echo -e "  ${DIM}  • \"create a test.py with a bug then fix it\"          ← multi-step${RESET}"
  echo -e "  ${DIM}  • \"read config.json and update the port to 9000\"     ← multi-step${RESET}"
  echo -e "  ${DIM}  • \"show disk usage and list the largest directory\"    ← multi-step${RESET}"
  echo -e "  ${DIM}  • \"create a hello.sh, make it executable, run it\"    ← multi-step${RESET}"
  echo -e "  ${DIM}  • \"search the web for latest Node.js LTS version\"    ← web search${RESET}"
  echo -e "  ${DIM}  • \"find info about Rust async/await and summarize\"   ← web search${RESET}"
  echo ""
}

show_status() {
  echo ""
  echo -e "${CYAN}${BOLD}  📊 System Context:${RESET}"
  echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
  echo -e "  ${WHITE}  OS${RESET}        │  $(uname -s) ($(uname -m))"
  echo -e "  ${WHITE}  User${RESET}      │  $(whoami)@$(hostname)"
  echo -e "  ${WHITE}  Shell${RESET}     │  $(basename "$SHELL")"
  echo -e "  ${WHITE}  CWD${RESET}       │  $(pwd)"
  echo -e "  ${WHITE}  Date${RESET}      │  $(date '+%Y-%m-%d %H:%M:%S')"
  local count; count=$(printf '%s' "$CHAT_HISTORY" | jq 'length')
  echo -e "  ${WHITE}  History${RESET}   │  $count messages"
  echo -e "  ${WHITE}  Max Steps${RESET} │  $MAX_AGENT_STEPS per user turn"
  echo -e "  ${WHITE}  Debug Raw${RESET} │  $SHOW_RAW"
  if [ -n "$ROLE_KNOWLEDGE" ]; then
    echo -e "  ${WHITE}  KB Role${RESET}   │  ${GREEN}Loaded${RESET} (from $KB_FILE)"
  else
    echo -e "  ${WHITE}  KB Role${RESET}   │  ${DIM}Not loaded (generic assistant)${RESET}"
  fi
  echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
  echo ""
}

show_history() {
  local count; count=$(printf '%s' "$CHAT_HISTORY" | jq 'length')
  if [[ "$count" -eq 0 ]]; then
    echo -e "  ${DIM}No history yet.${RESET}"; return
  fi
  echo ""
  echo -e "${CYAN}${BOLD}  📜 Chat History ($count messages):${RESET}"
  echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
  printf '%s' "$CHAT_HISTORY" | jq -r \
    '.[] | if .role == "user"
            then "  🧑 You: " + (.parts[0].text | .[0:100])
            else "  🤖 AI:  " + (.parts[0].text | split("\n")[0] | .[0:100])
           end'
  echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
  echo ""
}

# Colored action label for display
action_label() {
  case "$1" in
    run_command)    echo -e "${YELLOW}⚙️  COMMAND${RESET}" ;;
    read_file)      echo -e "${BLUE}📖 READ FILE${RESET}" ;;
    write_file)     echo -e "${MAGENTA}✏️  WRITE FILE${RESET}" ;;
    append_file)    echo -e "${MAGENTA}➕ APPEND FILE${RESET}" ;;
    modify_file)    echo -e "${CYAN}🔧 MODIFY FILE${RESET}" ;;
    list_directory) echo -e "${BLUE}📂 LIST DIR${RESET}" ;;
    web_search)     echo -e "${CYAN}🌐 WEB SEARCH${RESET}" ;;
    respond)        echo -e "${GREEN}💬 ANSWER${RESET}" ;;
    *)              echo -e "${DIM}❓ UNKNOWN${RESET}" ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────
#  Safety Helpers
# ─────────────────────────────────────────────────────────────────────────────

is_command_safe() {
  local cmd="$1"
  for pattern in "${BLOCKED_COMMANDS[@]}"; do
    if [[ "$cmd" == *"$pattern"* ]]; then echo "blocked"; return; fi
  done
  echo "safe"
}

is_path_safe() {
  local fp="$1"
  for pattern in "${PROTECTED_PATHS[@]}"; do
    if [[ "$fp" == "$pattern"* ]]; then echo "protected"; return; fi
  done
  echo "safe"
}

# ─────────────────────────────────────────────────────────────────────────────
#  Gemini API Call
# ─────────────────────────────────────────────────────────────────────────────

call_gemini() {
  local history="$1"
  local payload
  payload=$(jq -n \
    --arg sys "$SYSTEM_PROMPT" \
    --argjson history "$history" \
    '{
      contents: (
        [{
          role: "user",
          parts: [{ text: $sys }]
        }, {
          role: "model",
          parts: [{ text: "{\"action\":\"respond\",\"message\":\"Understood. I will always output a single raw JSON object, set done correctly, and chain steps one at a time.\",\"done\":true}" }]
        }]
        + $history
      ),
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    }')

  curl -s \
    -X POST "${API_URL}?key=${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

# ─────────────────────────────────────────────────────────────────────────────
#  Gemini API Call with Google Search Grounding
#
#  Uses the same Gemini API key — no extra search API key needed.
#  Sends {tools: [{google_search: {}}]} so Gemini grounds its answer
#  with live web results. Returns search-grounded text + source URLs.
# ─────────────────────────────────────────────────────────────────────────────

call_gemini_with_search() {
  local query="$1"
  local payload
  payload=$(jq -n \
    --arg query "$query" \
    '{
      contents: [{
        role: "user",
        parts: [{ text: ("Search the web and provide a detailed, factual answer with sources: " + $query) }]
      }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096
      }
    }')

  curl -s \
    -X POST "${API_URL}?key=${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

# Strip markdown fences and validate JSON
parse_ai_json() {
  echo "$1" \
    | sed 's/^[[:space:]]*```json[[:space:]]*//' \
    | sed 's/^[[:space:]]*```[[:space:]]*//' \
    | sed 's/[[:space:]]*```[[:space:]]*$//' \
    | tr -d '\r' \
    | jq '.' 2>/dev/null
}

# ─────────────────────────────────────────────────────────────────────────────
#  extract_done_flag
#
#  ╔══ BUG FIX ════════════════════════════════════════════════════════════════╗
#  ║  jq's // (alternative) operator treats boolean false as "empty",         ║
#  ║  so: jq '.done // true'  returns true even when .done == false           ║
#  ║                                                                           ║
#  ║  WRONG:  done_flag=$(echo "$parsed" | jq -r '.done // true')             ║
#  ║  RIGHT:  use this function which explicitly checks for false              ║
#  ╚═══════════════════════════════════════════════════════════════════════════╝
# ─────────────────────────────────────────────────────────────────────────────
extract_done_flag() {
  local parsed="$1"
  # jq returns the literal string "false" or "true" (or "null" if absent)
  local raw; raw=$(echo "$parsed" | jq '.done')
  if [[ "$raw" == "false" ]]; then
    echo "false"
  else
    # null (missing field) or true both mean "done"
    echo "true"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
#  execute_action
#
#  ╔══ DESIGN NOTE ════════════════════════════════════════════════════════════╗
#  ║  This function is called DIRECTLY (not inside $() subshell).             ║
#  ║  All echo/print commands go straight to the terminal.                    ║
#  ║  The action result is written to $RESULT_TMP for the loop to read.      ║
#  ╚═══════════════════════════════════════════════════════════════════════════╝
# ─────────────────────────────────────────────────────────────────────────────

execute_action() {
  local parsed="$1"

  # Extract all possible fields from the JSON
  local action message command filepath content find_text replace_text dir_path
  action=$(echo "$parsed"       | jq -r '.action      // "respond"')
  message=$(echo "$parsed"      | jq -r '.message     // ""')
  command=$(echo "$parsed"      | jq -r '.command     // ""')
  filepath=$(echo "$parsed"     | jq -r '.filepath    // ""')
  content=$(echo "$parsed"      | jq -r '.content     // ""')
  find_text=$(echo "$parsed"    | jq -r '.find        // ""')
  replace_text=$(echo "$parsed" | jq -r '.replace     // ""')
  dir_path=$(echo "$parsed"     | jq -r '.path        // ""')
  local search_query
  search_query=$(echo "$parsed"  | jq -r '.query       // ""')

  # Print action header
  local label; label=$(action_label "$action")
  echo ""
  echo -e "  ${BOLD}  [$label]${RESET}"
  echo -e "  ${DIM}  📝 Reason: $message${RESET}"
  echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"

  # ╔═══════════════╗
  # ║   respond     ║
  # ╚═══════════════╝
  if [[ "$action" == "respond" ]]; then

    echo ""
    echo -e "  ${CYAN}${BOLD}🤖 Agent:${RESET}"
    echo ""
    echo "$message" | fold -s -w 78 | sed 's/^/    /'
    echo ""

    echo "answered" > "$RESULT_TMP"

  # ╔═══════════════════╗
  # ║   run_command     ║
  # ╚═══════════════════╝
  elif [[ "$action" == "run_command" ]]; then

    echo -e "  ${YELLOW}${BOLD}  Command:${RESET} ${WHITE}$command${RESET}"
    echo ""

    # Safety check
    if [[ "$(is_command_safe "$command")" == "blocked" ]]; then
      echo -e "  ${RED}  🚫 BLOCKED — unsafe command pattern detected.${RESET}"
      echo "ERROR — command blocked by safety filter." > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    # Human approval
    read -p "$(echo -e "  ${YELLOW}  ▶ Approve execution? (y/n): ${RESET}")" approval
    if [[ "$approval" != "y" && "$approval" != "Y" ]]; then
      echo -e "  ${RED}  ❌ Rejected by user.${RESET}"
      echo "User rejected the command." > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    echo ""
    echo -e "  ${GREEN}  ⚙️  Executing...${RESET}"
    echo -e "  ${DIM}  ────────────────────────────────────────────${RESET}"

    local cmd_out exit_code
    cmd_out=$(eval "$command" 2>&1)
    exit_code=$?

    # Print output to terminal
    echo "$cmd_out" | head -50 | while IFS= read -r line; do
      echo -e "  ${DIM}  $line${RESET}"
    done
    local total_lines; total_lines=$(echo "$cmd_out" | wc -l)
    [[ $total_lines -gt 50 ]] && \
      echo -e "  ${DIM}  ... (output truncated: $total_lines lines total)${RESET}"

    echo -e "  ${DIM}  ────────────────────────────────────────────${RESET}"
    if [[ $exit_code -eq 0 ]]; then
      echo -e "  ${GREEN}  ✅ Command completed successfully (exit 0)${RESET}"
    else
      echo -e "  ${RED}  ⚠️  Command exited with code: $exit_code${RESET}"
    fi

    # Write result for the agentic loop
    printf '[Command output (exit %d)]:\n%s' "$exit_code" "$cmd_out" > "$RESULT_TMP"

  # ╔═══════════════╗
  # ║  read_file    ║
  # ╚═══════════════╝
  elif [[ "$action" == "read_file" ]]; then

    filepath="${filepath/#\~/$HOME}"
    echo -e "  ${BLUE}  File:${RESET} $filepath"
    echo ""

    # Safety check
    if [[ "$(is_path_safe "$filepath")" == "protected" ]]; then
      echo -e "  ${RED}  🚫 BLOCKED — protected system file.${RESET}"
      echo "ERROR — protected file, access denied: $filepath" > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    # Human approval
    read -p "$(echo -e "  ${YELLOW}  ▶ Approve reading '$filepath'? (y/n): ${RESET}")" approval
    if [[ "$approval" != "y" && "$approval" != "Y" ]]; then
      echo -e "  ${RED}  ❌ Rejected by user.${RESET}"
      echo "User rejected the file read." > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    if [[ ! -f "$filepath" ]]; then
      echo -e "  ${RED}  ❌ File not found: $filepath${RESET}"
      echo "ERROR — file not found: $filepath" > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    local total_lines; total_lines=$(wc -l < "$filepath")
    local file_size;   file_size=$(wc -c < "$filepath")
    local file_content; file_content=$(head -c 12000 "$filepath")
    local truncated=""
    [[ ${#file_content} -ge 12000 ]] && truncated=$'\n[... file truncated at 12000 chars ...]'

    echo -e "  ${DIM}  Lines: $total_lines  |  Size: ${file_size} bytes${RESET}"
    echo ""
    echo -e "  ${GREEN}  ── File Contents ──────────────────────────────${RESET}"
    echo "$file_content" | head -80 | while IFS= read -r line; do
      echo -e "  ${DIM}  $line${RESET}"
    done
    [[ $total_lines -gt 80 ]] && \
      echo -e "  ${DIM}  ... (showing first 80 of $total_lines lines)${RESET}"
    echo -e "  ${GREEN}  ────────────────────────────────────────────────${RESET}"
    echo ""
    echo -e "  ${GREEN}  ✅ File read successfully ($total_lines lines).${RESET}"

    # Write full content to temp file for the loop to pass back to AI
    printf "[File '%s' (%d lines)]:\n%s%s" \
      "$filepath" "$total_lines" "$file_content" "$truncated" > "$RESULT_TMP"

  # ╔════════════════╗
  # ║  write_file    ║
  # ╚════════════════╝
  elif [[ "$action" == "write_file" ]]; then

    filepath="${filepath/#\~/$HOME}"
    echo -e "  ${MAGENTA}  File:${RESET} $filepath"
    echo ""

    # Safety check
    if [[ "$(is_path_safe "$filepath")" == "protected" ]]; then
      echo -e "  ${RED}  🚫 BLOCKED — protected path.${RESET}"
      echo "ERROR — protected path: $filepath" > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    [[ -f "$filepath" ]] && \
      echo -e "  ${RED}  ⚠️  WARNING: File already exists — will be OVERWRITTEN${RESET}"

    local content_lines; content_lines=$(echo "$content" | wc -l)
    echo -e "  ${DIM}  ── Content Preview (first 20 lines) ──────────────${RESET}"
    echo "$content" | head -20 | while IFS= read -r line; do
      echo -e "  ${DIM}  │  $line${RESET}"
    done
    [[ $content_lines -gt 20 ]] && \
      echo -e "  ${DIM}  ... ($content_lines lines total, showing first 20)${RESET}"
    echo -e "  ${DIM}  ──────────────────────────────────────────────────${RESET}"
    echo ""

    # Human approval
    read -p "$(echo -e "  ${YELLOW}  ▶ Approve write to '$filepath'? (y/n): ${RESET}")" approval
    if [[ "$approval" != "y" && "$approval" != "Y" ]]; then
      echo -e "  ${RED}  ❌ Rejected by user.${RESET}"
      echo "User rejected the file write." > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    mkdir -p "$(dirname "$filepath")" 2>/dev/null
    printf '%s\n' "$content" > "$filepath"
    if [[ $? -eq 0 ]]; then
      echo -e "  ${GREEN}  ✅ File written: $filepath ($content_lines lines)${RESET}"
      printf "File written successfully to '%s' (%d lines)." \
        "$filepath" "$content_lines" > "$RESULT_TMP"
    else
      echo -e "  ${RED}  ❌ Write failed.${RESET}"
      echo "ERROR — failed to write file: $filepath" > "$RESULT_TMP"
    fi

  # ╔════════════════════╗
  # ║   append_file      ║
  # ╚════════════════════╝
  elif [[ "$action" == "append_file" ]]; then

    filepath="${filepath/#\~/$HOME}"
    echo -e "  ${MAGENTA}  File:${RESET} $filepath"
    echo ""

    # Safety check
    if [[ "$(is_path_safe "$filepath")" == "protected" ]]; then
      echo -e "  ${RED}  🚫 BLOCKED — protected path.${RESET}"
      echo "ERROR — protected path: $filepath" > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    echo -e "  ${DIM}  ── Content to Append ──────────────────────────────${RESET}"
    echo "$content" | head -10 | while IFS= read -r line; do
      echo -e "  ${DIM}  │  $line${RESET}"
    done
    echo -e "  ${DIM}  ────────────────────────────────────────────────────${RESET}"
    echo ""

    # Human approval
    read -p "$(echo -e "  ${YELLOW}  ▶ Approve append to '$filepath'? (y/n): ${RESET}")" approval
    if [[ "$approval" != "y" && "$approval" != "Y" ]]; then
      echo -e "  ${RED}  ❌ Rejected by user.${RESET}"
      echo "User rejected the append." > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    printf '%s\n' "$content" >> "$filepath"
    echo -e "  ${GREEN}  ✅ Content appended to '$filepath'.${RESET}"
    printf "Content appended successfully to '%s'." "$filepath" > "$RESULT_TMP"

  # ╔════════════════════╗
  # ║   modify_file      ║
  # ╚════════════════════╝
  elif [[ "$action" == "modify_file" ]]; then

    filepath="${filepath/#\~/$HOME}"
    echo -e "  ${CYAN}  File:${RESET} $filepath"
    echo ""

    # Safety check
    if [[ "$(is_path_safe "$filepath")" == "protected" ]]; then
      echo -e "  ${RED}  🚫 BLOCKED — protected file.${RESET}"
      echo "ERROR — protected file: $filepath" > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    if [[ ! -f "$filepath" ]]; then
      echo -e "  ${RED}  ❌ File not found: $filepath${RESET}"
      echo "ERROR — file not found: $filepath" > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    echo -e "  ${RED}  − Find:${RESET}"
    echo "$find_text" | head -5 | while IFS= read -r line; do
      echo -e "  ${RED}      $line${RESET}"
    done
    echo ""
    echo -e "  ${GREEN}  + Replace:${RESET}"
    echo "$replace_text" | head -5 | while IFS= read -r line; do
      echo -e "  ${GREEN}      $line${RESET}"
    done
    echo ""

    # Human approval
    read -p "$(echo -e "  ${YELLOW}  ▶ Approve this change to '$filepath'? (y/n): ${RESET}")" approval
    if [[ "$approval" != "y" && "$approval" != "Y" ]]; then
      echo -e "  ${RED}  ❌ Rejected by user.${RESET}"
      echo "User rejected the modification." > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    if ! grep -qF "$find_text" "$filepath"; then
      echo -e "  ${RED}  ❌ Text not found in file. Cannot patch.${RESET}"
      echo "ERROR — find text not found in '$filepath'. The file may need to be read first to get the exact text." > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    # Backup original
    cp "$filepath" "${filepath}.bak"
    echo -e "  ${DIM}  Backup saved: ${filepath}.bak${RESET}"

    # Reliable multi-line find-and-replace via python3
    python3 - "$filepath" "$find_text" "$replace_text" << 'PYEOF'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    data = open(path, 'r').read()
    if old not in data:
        print("NOT_FOUND")
        sys.exit(1)
    open(path, 'w').write(data.replace(old, new, 1))
    print("OK")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(2)
PYEOF

    if [[ $? -eq 0 ]]; then
      echo -e "  ${GREEN}  ✅ File modified: $filepath${RESET}"
      printf "File '%s' modified successfully. Backup saved at '%s.bak'." \
        "$filepath" "$filepath" > "$RESULT_TMP"
    else
      echo -e "  ${RED}  ❌ Modification failed.${RESET}"
      echo "ERROR — modification failed for '$filepath'." > "$RESULT_TMP"
    fi

  # ╔═══════════════════════╗
  # ║   list_directory      ║
  # ╚═══════════════════════╝
  elif [[ "$action" == "list_directory" ]]; then

    dir_path="${dir_path/#\~/$HOME}"
    [[ -z "$dir_path" ]] && dir_path="."
    echo -e "  ${BLUE}  Path:${RESET} $dir_path"
    echo ""

    # Human approval
    read -p "$(echo -e "  ${YELLOW}  ▶ Approve listing '$dir_path'? (y/n): ${RESET}")" approval
    if [[ "$approval" != "y" && "$approval" != "Y" ]]; then
      echo -e "  ${RED}  ❌ Rejected by user.${RESET}"
      echo "User rejected the directory listing." > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    if [[ ! -d "$dir_path" ]]; then
      echo -e "  ${RED}  ❌ Directory not found: $dir_path${RESET}"
      echo "ERROR — directory not found: $dir_path" > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    local dir_out; dir_out=$(ls -la "$dir_path" 2>&1 | head -60)
    echo -e "  ${GREEN}  ── Directory Listing ──────────────────────────────${RESET}"
    echo "$dir_out" | while IFS= read -r line; do
      echo -e "  ${DIM}  $line${RESET}"
    done
    echo -e "  ${GREEN}  ────────────────────────────────────────────────────${RESET}"
    echo ""
    echo -e "  ${GREEN}  ✅ Listed successfully.${RESET}"

    printf "[Directory listing of '%s']:\n%s" "$dir_path" "$dir_out" > "$RESULT_TMP"

  # ╔═══════════════════╗
  # ║   web_search      ║
  # ╚═══════════════════╝
  elif [[ "$action" == "web_search" ]]; then

    echo -e "  ${CYAN}  Query:${RESET} $search_query"
    echo ""

    if [[ -z "$search_query" ]]; then
      echo -e "  ${RED}  ❌ No search query provided.${RESET}"
      echo "ERROR — no search query provided." > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    # Human approval
    read -p "$(echo -e "  ${YELLOW}  ▶ Approve web search for '$search_query'? (y/n): ${RESET}")" approval
    if [[ "$approval" != "y" && "$approval" != "Y" ]]; then
      echo -e "  ${RED}  ❌ Rejected by user.${RESET}"
      echo "User rejected the web search." > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    echo -e "  ${GREEN}  🌐 Searching the web...${RESET}"
    echo ""

    local search_response search_text
    search_response=$(call_gemini_with_search "$search_query")

    # Extract the grounded answer text
    search_text=$(echo "$search_response" \
      | jq -r '.candidates[0].content.parts[] | select(.text) | .text' 2>/dev/null \
      | head -c 8000)

    if [[ -z "$search_text" || "$search_text" == "null" ]]; then
      local search_err
      search_err=$(echo "$search_response" \
        | jq -r '.error.message // "Search failed — unknown error"' 2>/dev/null)
      echo -e "  ${RED}  ❌ Web search failed: $search_err${RESET}"
      echo "ERROR — web search failed: $search_err" > "$RESULT_TMP"
      echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
      return
    fi

    # Extract grounding source URLs if available
    local sources
    sources=$(echo "$search_response" \
      | jq -r '[.candidates[0].groundingMetadata.groundingChunks[]?.web.uri // empty] | unique[]' 2>/dev/null \
      | head -8)

    echo -e "  ${GREEN}  ── Search Results ──────────────────────────────${RESET}"
    echo "$search_text" | head -60 | while IFS= read -r line; do
      echo -e "  ${DIM}  $line${RESET}"
    done
    local search_lines; search_lines=$(echo "$search_text" | wc -l)
    [[ $search_lines -gt 60 ]] && \
      echo -e "  ${DIM}  ... (showing first 60 of $search_lines lines)${RESET}"

    if [[ -n "$sources" ]]; then
      echo ""
      echo -e "  ${BLUE}  📎 Sources:${RESET}"
      echo "$sources" | while IFS= read -r src; do
        echo -e "  ${DIM}    • $src${RESET}"
      done
    fi
    echo -e "  ${GREEN}  ────────────────────────────────────────────────${RESET}"
    echo ""
    echo -e "  ${GREEN}  ✅ Web search completed.${RESET}"

    # Write result for the agentic loop
    local source_text=""
    [[ -n "$sources" ]] && source_text=$(printf '\n\nSources:\n%s' "$sources")
    printf "[Web search results for '%s']:\n%s%s" \
      "$search_query" "$search_text" "$source_text" > "$RESULT_TMP"

  else

    echo -e "  ${YELLOW}  ⚠️  Unknown action: '$action'${RESET}"
    printf "ERROR — unknown action '%s'." "$action" > "$RESULT_TMP"

  fi

  echo -e "  ${GREEN}──────────────────────────────────────────────────────────${RESET}"
}

# ─────────────────────────────────────────────────────────────────────────────
#  Agentic Loop
#
#  How it works for each user turn:
#    1.  Append user message to history (merged with context as ONE user message)
#    2.  Call Gemini → returns JSON with {action, ..., done: true|false}
#    3.  Show raw JSON if debug mode is on
#    4.  Parse and validate JSON
#    5.  Call execute_action directly (NOT in a subshell — so all echoes print)
#    6.  Read result from RESULT_TMP
#    7.  Save AI response to history
#    8a. done=true  → task complete, exit loop
#    8b. done=false → inject "[Step N result]" into history, go back to step 2
#
#  ╔══ BUG FIX ════════════════════════════════════════════════════════════════╗
#  ║  1. done_flag uses extract_done_flag() — NOT jq '.done // true'         ║
#  ║     because jq // treats false as empty, so false // true = true,       ║
#  ║     meaning the loop always exited after step 1.                         ║
#  ║                                                                           ║
#  ║  2. User message + context are merged into ONE user message              ║
#  ║     to keep the conversation turns valid (user → model → user → ...)    ║
#  ╚═══════════════════════════════════════════════════════════════════════════╝
# ─────────────────────────────────────────────────────────────────────────────

run_agent_turn() {
  local user_input="$1"
  local step=0

  # ── BUG FIX 2: merge user message + context into a SINGLE user turn ────────
  # Two consecutive role:"user" messages break the model's turn tracking.
  local combined_input
  combined_input=$(printf '%s\n\n[System context] CWD: %s | Date: %s' \
    "$user_input" "$(pwd)" "$(date '+%Y-%m-%d %H:%M:%S')")

  CHAT_HISTORY=$(printf '%s' "$CHAT_HISTORY" | jq \
    --arg text "$combined_input" \
    '. += [{"role": "user", "parts": [{"text": $text}]}]')
  printf '%s' "$CHAT_HISTORY" > "$HISTORY_FILE"

  echo ""
  echo -e "  ${DIM}  ⏳ Thinking...${RESET}"

  # ── Step loop ────────────────────────────────────────────────────────────────
  while [[ $step -lt $MAX_AGENT_STEPS ]]; do
    (( step++ ))

    if [[ $step -gt 1 ]]; then
      echo ""
      echo -e "  ${CYAN}${BOLD}  ┌─ Step $step / $MAX_AGENT_STEPS ──────────────────────────────────┐${RESET}"
      echo -e "  ${DIM}  ⏳ Calling AI for next step...${RESET}"
    fi

    # ── 1. Call Gemini API ──────────────────────────────────────────────────
    local api_response
    api_response=$(call_gemini "$CHAT_HISTORY")

    local ai_output
    ai_output=$(echo "$api_response" \
      | jq -r '.candidates[0].content.parts[0].text' 2>/dev/null)

    # Handle API errors
    if [[ -z "$ai_output" || "$ai_output" == "null" ]]; then
      local err; err=$(echo "$api_response" \
        | jq -r '.error.message // "Unknown API error"')
      echo ""
      echo -e "  ${RED}  ❌ API Error: $err${RESET}"
      break
    fi

    # ── 2. Raw JSON debug (toggle with 'raw' command) ───────────────────────
    if [[ "$SHOW_RAW" == true ]]; then
      echo ""
      echo -e "  ${DIM}  ── Raw AI JSON (step $step) ─────────────────────${RESET}"
      echo "$ai_output" | head -15 | sed 's/^/    /'
      echo -e "  ${DIM}  ────────────────────────────────────────────────${RESET}"
    fi

    # ── 3. Parse and validate JSON ──────────────────────────────────────────
    local parsed
    parsed=$(parse_ai_json "$ai_output")

    if [[ -z "$parsed" ]]; then
      echo ""
      echo -e "  ${YELLOW}  ⚠️  AI response was not valid JSON. Showing raw:${RESET}"
      echo ""
      echo "$ai_output" | fold -s -w 80 | sed 's/^/    /'
      echo ""
      # Save and stop gracefully
      CHAT_HISTORY=$(printf '%s' "$CHAT_HISTORY" | jq \
        --arg text "$ai_output" \
        '. += [{"role": "model", "parts": [{"text": $text}]}]')
      printf '%s' "$CHAT_HISTORY" > "$HISTORY_FILE"
      break
    fi

    local action
    action=$(echo "$parsed" | jq -r '.action // "respond"')

    # ── BUG FIX 1: use extract_done_flag, not jq '.done // true' ───────────
    local done_flag
    done_flag=$(extract_done_flag "$parsed")

    # ── 4. Execute action — prints to terminal, writes result to RESULT_TMP ─
    > "$RESULT_TMP"          # clear before each action
    execute_action "$parsed"
    local result_text; result_text=$(cat "$RESULT_TMP")

    # ── 5. Save AI response to history ─────────────────────────────────────
    CHAT_HISTORY=$(printf '%s' "$CHAT_HISTORY" | jq \
      --arg text "$ai_output" \
      '. += [{"role": "model", "parts": [{"text": $text}]}]')
    printf '%s' "$CHAT_HISTORY" > "$HISTORY_FILE"

    # ── 6. Decide: done or keep chaining? ──────────────────────────────────
    if [[ "$done_flag" == "true" ]]; then
      echo ""
      echo -e "  ${GREEN}  ✔ Task complete after $step step(s).${RESET}"
      break
    else
      # Inject step result as a new user message so the AI sees what happened
      # and can decide its next action
      local followup
      followup=$(printf '[Step %d result — action: %s]:\n%s\n\nPlease proceed with the next step of the plan.' \
        "$step" "$action" "$result_text")

      CHAT_HISTORY=$(printf '%s' "$CHAT_HISTORY" | jq \
        --arg text "$followup" \
        '. += [{"role": "user", "parts": [{"text": $text}]}]')
      printf '%s' "$CHAT_HISTORY" > "$HISTORY_FILE"

      echo ""
      echo -e "  ${DIM}  ↻ Step $step done (done=false) — feeding result to AI for next step...${RESET}"
    fi
  done

  if [[ $step -ge $MAX_AGENT_STEPS ]]; then
    echo ""
    echo -e "  ${YELLOW}  ⚠️  Reached max steps ($MAX_AGENT_STEPS). Stopping.${RESET}"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
#  System Prompt  (built once at startup with live env baked in)
#
#  ╔══ KNOWLEDGE BASE INTEGRATION ═════════════════════════════════════════════╗
#  ║  The default system prompt is ALWAYS used as the base.                    ║
#  ║  If a knowledge base file is provided, its content is APPENDED to the    ║
#  ║  system prompt as an additional "ROLE & KNOWLEDGE BASE" section.          ║
#  ║  If no KB file is given, the default prompt is used as-is.               ║
#  ╚═══════════════════════════════════════════════════════════════════════════╝
# ─────────────────────────────────────────────────────────────────────────────

build_system_prompt() {
  # ── Default system prompt (always present) ──────────────────────────────────
  SYSTEM_PROMPT="You are a general-purpose AI assistant running inside a Linux terminal.
You can answer any question and interact with the local filesystem and shell.

System context:
  OS:      $(uname -s) ($(uname -m))
  User:    $(whoami)@$(hostname)
  Shell:   $(basename "$SHELL")
  CWD:     $(pwd)
  Date:    $(date '+%Y-%m-%d %H:%M:%S')

════════════════════════════════════════════════════════════════
RESPONSE FORMAT
════════════════════════════════════════════════════════════════
Always respond with a SINGLE raw JSON object.
No markdown. No code fences. No text before or after the JSON.

════════════════════════════════════════════════════════════════
AVAILABLE ACTIONS — pick exactly one per response
════════════════════════════════════════════════════════════════

1. respond          — Answer a question or summarize what was done
   { \"action\": \"respond\", \"message\": \"<text>\", \"done\": true }

2. run_command      — Execute a shell command
   { \"action\": \"run_command\", \"command\": \"<shell cmd>\", \"message\": \"<why>\", \"done\": true|false }

3. read_file        — Read a file's contents (always set done=false, you need to see the content)
   { \"action\": \"read_file\", \"filepath\": \"<path>\", \"message\": \"<why>\", \"done\": false }

4. write_file       — Create or overwrite a file
   { \"action\": \"write_file\", \"filepath\": \"<path>\", \"content\": \"<full content>\", \"message\": \"<why>\", \"done\": true|false }

5. append_file      — Append text to an existing file
   { \"action\": \"append_file\", \"filepath\": \"<path>\", \"content\": \"<text>\", \"message\": \"<why>\", \"done\": true|false }

6. modify_file      — Find and replace text in a file (exact text match required)
   { \"action\": \"modify_file\", \"filepath\": \"<path>\", \"find\": \"<exact existing text>\", \"replace\": \"<new text>\", \"message\": \"<why>\", \"done\": true|false }

7. list_directory   — List directory contents
   { \"action\": \"list_directory\", \"path\": \"<dir>\", \"message\": \"<why>\", \"done\": true|false }

8. web_search       — Search the web for real-time / up-to-date information
   { \"action\": \"web_search\", \"query\": \"<search query>\", \"message\": \"<why>\", \"done\": false }
   IMPORTANT: Always set done=false for web_search — you need to see the results first then summarize with a respond action.
   Use this when the user asks about current events, latest versions, live data, or anything your training data may not cover.

════════════════════════════════════════════════════════════════
THE \"done\" FLAG — THIS IS HOW MULTI-STEP CHAINING WORKS
════════════════════════════════════════════════════════════════
You execute ONE action per response.
After the user approves and the action runs, the system feeds you the result.
You then choose the NEXT action. This repeats until the full task is done.

\"done\": false  — You still have more steps to do after this action.
                  The system will show you the result and call you again.
\"done\": true   — This is your final action. The task is complete.

════════════════════════════════════════════════════════════════
MULTI-STEP EXAMPLE — \"create a test.py with a bug, then fix it\"
════════════════════════════════════════════════════════════════
Step 1 → write_file: create test.py with intentional bug     (done=false)
Step 2 → read_file:  read test.py to confirm what was written (done=false)
Step 3 → modify_file: fix the bug using exact text from step 2 (done=false)
Step 4 → respond:    summarize the work done                  (done=true)

MORE EXAMPLES:
  \"read config.json and update port to 9000\"
  → read_file(done=false) → modify_file(done=false) → respond(done=true)

  \"show disk usage then list the biggest directory\"
  → run_command df -h(done=false) → list_directory(done=true)

  \"create hello.sh, chmod +x it, then run it\"
  → write_file(done=false) → run_command chmod(done=false) → run_command ./hello.sh(done=true)

  \"search the web for latest Node.js LTS version\"
  → web_search(done=false) → respond: summarize findings(done=true)

════════════════════════════════════════════════════════════════
RULES
════════════════════════════════════════════════════════════════
- Output ONLY the JSON object. Nothing else. Ever.
- One action per response. The system handles the loop and result injection.
- For modify_file: you MUST use the exact text from the file (read it first if unsure).
- Never use: rm -rf /, mkfs, dd, shutdown, reboot, halt, fork bombs.
- Never touch: /etc/passwd, /etc/shadow, /boot/, /proc/, /dev/.
- Always explain what you are doing in the \"message\" field.
- For pure Q&A with no file/command needed: action=respond, done=true.
- For web_search: ALWAYS set done=false. After receiving results, use respond to summarize.
- Use web_search when the user asks about current/real-time information, latest versions, news, or anything you are unsure about."

  # ── Conditionally append Knowledge Base role if provided ────────────────────
  if [ -n "$ROLE_KNOWLEDGE" ]; then
    SYSTEM_PROMPT="${SYSTEM_PROMPT}

════════════════════════════════════════════════════════════════
ROLE & KNOWLEDGE BASE (Loaded from file)
════════════════════════════════════════════════════════════════
You must strictly follow the role, behavior, and expertise defined below.
Always respond as this persona while still obeying all the rules and JSON
format above. Your domain knowledge and personality come from this section,
but your output format and available actions remain unchanged.

${ROLE_KNOWLEDGE}"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────────────────────────

print_banner

# ── API key ───────────────────────────────────────────────────────────────────
read -p "$(echo -e "  ${YELLOW}🔑 Gemini API Key: ${RESET}")" API_KEY
[[ -z "$API_KEY" ]] && echo -e "${RED}  ❌ No key provided. Exiting.${RESET}" && exit 1
echo -e "  ${GREEN}  ✅ Key received.${RESET}"
echo ""

# ── Knowledge Base (optional role file) ───────────────────────────────────────
echo -e "  ${BLUE}${BOLD}📚 Knowledge Base Setup:${RESET}"
echo -e "  ${DIM}  Provide a file containing role/behavior/expertise to customize the agent.${RESET}"
echo -e "  ${DIM}  Or press Enter to skip and use the default generic assistant.${RESET}"
echo ""
read -p "$(echo -e "  ${YELLOW}📂 Knowledge base file path (or Enter to skip): ${RESET}")" KB_FILE

if [ -n "$KB_FILE" ] && [ -f "$KB_FILE" ]; then
  ROLE_KNOWLEDGE=$(cat "$KB_FILE")
  echo ""
  echo -e "  ${GREEN}  ✅ Role Loaded from: ${WHITE}$KB_FILE${RESET}"
  echo -e "  ${DIM}  ── Role Preview (first 5 lines) ──────────────────────${RESET}"
  head -5 "$KB_FILE" | while IFS= read -r line; do
    echo -e "  ${DIM}  │  $line${RESET}"
  done
  local_lines=$(wc -l < "$KB_FILE")
  [[ $local_lines -gt 5 ]] && \
    echo -e "  ${DIM}  │  ... ($local_lines lines total)${RESET}"
  echo -e "  ${DIM}  ──────────────────────────────────────────────────────${RESET}"
elif [ -n "$KB_FILE" ] && [ ! -f "$KB_FILE" ]; then
  echo ""
  echo -e "  ${RED}  ⚠️  File not found: $KB_FILE${RESET}"
  echo -e "  ${YELLOW}  ⚡ Continuing as a generic assistant.${RESET}"
  ROLE_KNOWLEDGE=""
else
  echo ""
  echo -e "  ${YELLOW}  ⚡ No role file provided. Running as a generic assistant.${RESET}"
  ROLE_KNOWLEDGE=""
fi
echo ""

# ── Build system prompt with current env + optional KB baked in ───────────────
build_system_prompt

# ── Load or initialise history ────────────────────────────────────────────────
if [[ -f "$HISTORY_FILE" ]]; then
  CHAT_HISTORY=$(cat "$HISTORY_FILE")
  local_count=$(printf '%s' "$CHAT_HISTORY" | jq 'length')
  echo -e "  ${CYAN}  📂 Loaded $local_count messages from $HISTORY_FILE${RESET}"
else
  CHAT_HISTORY="[]"
  echo -e "  ${CYAN}  🆕 Starting fresh conversation.${RESET}"
fi

echo -e "  ${DIM}  System: $(uname -s) ($(uname -m)) | User: $(whoami) | Shell: $(basename "$SHELL")${RESET}"
if [ -n "$ROLE_KNOWLEDGE" ]; then
  echo -e "  ${GREEN}  📚 Knowledge Base: Active${RESET} ${DIM}(from $KB_FILE)${RESET}"
else
  echo -e "  ${DIM}  📚 Knowledge Base: Not loaded (generic mode)${RESET}"
fi
echo ""
echo -e "  ${GREEN}══════════════════════════════════════════════════════════${RESET}"
echo -e "  ${BOLD}  🚀 Agent ready! Type your request. (type 'help' for tips)${RESET}"
echo -e "  ${GREEN}══════════════════════════════════════════════════════════${RESET}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
#  REPL
# ─────────────────────────────────────────────────────────────────────────────
while true; do
  echo -e "${BOLD}  🧑 You:${RESET}"
  read -p "  > " user_input

  case "$user_input" in
    exit|quit)
      echo ""
      echo -e "  ${GREEN}  ✅ History saved → $HISTORY_FILE${RESET}"
      echo -e "  ${CYAN}  👋 Goodbye!${RESET}"
      echo ""
      break
      ;;
    clear)
      CHAT_HISTORY="[]"
      printf '%s' "$CHAT_HISTORY" > "$HISTORY_FILE"
      echo -e "  ${YELLOW}  🗑️  History cleared.${RESET}"
      ;;
    history)
      show_history
      ;;
    status)
      show_status
      ;;
    help)
      show_help
      ;;
    raw)
      if [[ "$SHOW_RAW" == true ]]; then
        SHOW_RAW=false
        echo -e "  ${DIM}  Debug JSON output: OFF${RESET}"
      else
        SHOW_RAW=true
        echo -e "  ${YELLOW}  Debug JSON output: ON (type 'raw' again to turn off)${RESET}"
      fi
      ;;
    "")
      echo -e "  ${RED}  Please enter something. Type 'help' for tips.${RESET}"
      ;;
    *)
      run_agent_turn "$user_input"
      ;;
  esac
  echo ""
done