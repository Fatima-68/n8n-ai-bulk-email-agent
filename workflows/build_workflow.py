#!/usr/bin/env python3
"""Builds importable n8n workflow JSON files from the editable JS in workflows/code/.

Usage:  python workflows/build_workflow.py
Output: workflows/bulk_email_agent.json, workflows/unsubscribe_webhook.json
"""
import json
import pathlib
import sys
import uuid

HERE = pathlib.Path(__file__).parent
CODE = HERE / "code"


# Data folder the Code nodes read/write. Default = <project>/data/files (absolute, forward slashes).
# Use `--docker` to build for the docker-compose setup (folder mounted at /files).
DATA_DIR = "/files" if "--docker" in sys.argv else (HERE.parent / "data" / "files").resolve().as_posix()


def js(name):
    return (CODE / f"{name}.js").read_text(encoding="utf-8").replace("__DATA_DIR__", DATA_DIR)


def code_node(name, file, pos, mode="runOnceForAllItems"):
    return {
        "parameters": {"mode": mode, "jsCode": js(file)},
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, name)),
        "name": name, "type": "n8n-nodes-base.code", "typeVersion": 2, "position": pos,
    }


def cond_bool(left):
    return {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
            "conditions": [{"id": str(uuid.uuid4()), "leftValue": left, "rightValue": "",
                            "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
            "combinator": "and"}


def cond_str_eq(left, right):
    return {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
            "conditions": [{"id": str(uuid.uuid4()), "leftValue": left, "rightValue": right,
                            "operator": {"type": "string", "operation": "equals"}}],
            "combinator": "and"}


def if_node(name, conditions, pos):
    return {"parameters": {"conditions": conditions, "options": {}},
            "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, name)),
            "name": name, "type": "n8n-nodes-base.if", "typeVersion": 2, "position": pos}


def dropdown(label, values, required=True):
    return {"fieldLabel": label, "fieldType": "dropdown", "requiredField": required,
            "fieldOptions": {"values": [{"option": v} for v in values]}}


def link(conns, src, dst, out=0):
    conns.setdefault(src, {"main": []})
    main = conns[src]["main"]
    while len(main) <= out:
        main.append([])
    main[out].append({"node": dst, "type": "main", "index": 0})


# ---------------------------------------------------------------- main workflow
nodes = [
    {
        "parameters": {
            "formTitle": "AI Bulk Email Agent",
            "formDescription": "Preview = generate drafts for review (nothing is sent). Send = deliver only rows you marked Approved in the review file.",
            "formFields": {"values": [
                dropdown("Mode", ["Preview", "Send"]),
                {"fieldLabel": "Campaign ID", "fieldType": "text",
                 "placeholder": "Leave empty in Preview. REQUIRED in Send (copy from the preview report)."},
                dropdown("Campaign Type", ["excel", "product", "service", "custom"]),
                {"fieldLabel": "Campaign Prompt", "fieldType": "textarea",
                 "placeholder": "Optional for 'excel'. Describe the product/service/offer for the others."},
                {"fieldLabel": "Call To Action", "fieldType": "text",
                 "placeholder": "e.g. a 15-minute discussion"},
                {"fieldLabel": "Tone", "fieldType": "text", "placeholder": "e.g. credible, direct, warm"},
                {"fieldLabel": "Batch Size", "fieldType": "number", "placeholder": "1"},
                {"fieldLabel": "Seconds Between Batches", "fieldType": "number", "placeholder": "30"},
                dropdown("Dry Run", ["Yes (simulate, send nothing)", "No (really send)"]),
                {"fieldLabel": "Leads File", "fieldType": "file", "requiredField": True,
                 "acceptFileTypes": ".xlsx", "multipleFiles": False},
            ]},
            "responseMode": "onReceived",
            "options": {"buttonLabel": "Run",
                        "respondWithOptions": {"values": {
                            "formSubmittedText": "Run started. When it finishes, see data/files/reviews/ (Preview) or data/files/reports/ (Send) in VS Code."}}},
        },
        "id": str(uuid.uuid4()), "name": "Campaign Form", "type": "n8n-nodes-base.formTrigger",
        "typeVersion": 2.1, "position": [0, 300], "webhookId": str(uuid.uuid4()),
    },
    code_node("Config", "config", [220, 300]),
    {"parameters": {"operation": "xlsx", "binaryPropertyName": "data", "options": {}},
     "id": str(uuid.uuid4()), "name": "Read Excel", "type": "n8n-nodes-base.extractFromFile",
     "typeVersion": 1, "position": [440, 300]},
    code_node("Normalize", "normalize", [660, 300]),
    code_node("Validate", "validate", [880, 300]),
    if_node("Eligible?", cond_bool("={{ $json.eligible }}"), [1100, 300]),
    if_node("Preview Mode?", cond_str_eq("={{ $('Config').first().json.mode }}", "Preview"), [1320, 200]),

    # ---- preview branch
    code_node("Build Prompt", "build_prompt", [1540, 100]),
    {
        "parameters": {
            "method": "POST", "url": "https://api.openai.com/v1/chat/completions",
            "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
            "sendHeaders": True,
            "headerParameters": {"parameters": [{"name": "anthropic-version", "value": "2023-06-01"}]},
            "sendBody": True, "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify($json.request_body) }}",
            "options": {"timeout": 90000,
                        "batching": {"batch": {"batchSize": 3, "batchInterval": 1500}}},
        },
        "id": str(uuid.uuid4()), "name": "Claude Generate Email", "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2, "position": [1760, 100],
        "retryOnFail": True, "maxTries": 3, "waitBetweenTries": 3000, "onError": "continueRegularOutput",
        "credentials": {"httpHeaderAuth": {"id": "REPLACE_ME", "name": "Anthropic API Key"}},
    },
    code_node("Parse & Validate AI Output", "parse_ai", [1980, 100]),
    code_node("Build Review Rows", "build_review", [2200, 100]),
    {"parameters": {"operation": "xlsx", "options": {"fileName": "review.xlsx", "sheetName": "Leads"}},
     "id": str(uuid.uuid4()), "name": "Make Review XLSX", "type": "n8n-nodes-base.convertToFile",
     "typeVersion": 1.1, "position": [2420, 100]},
    {"parameters": {"operation": "write",
                    "fileName": "=" + DATA_DIR + "/reviews/{{ $('Config').first().json.campaign_id }}_review.xlsx",
                    "dataPropertyName": "data", "options": {}},
     "id": str(uuid.uuid4()), "name": "Save Review File", "type": "n8n-nodes-base.readWriteFile",
     "typeVersion": 1, "position": [2640, 100]},
    code_node("Preview Report", "preview_report", [2860, 100]),

    # ---- send branch
    code_node("Prepare Send", "prepare_send", [1540, 400]),
    if_node("Dry Run?", cond_bool("={{ $('Config').first().json.dry_run }}"), [1760, 400]),
    code_node("Dry Run Log", "dry_run", [1980, 300]),
    {"parameters": {"batchSize": "={{ $('Config').first().json.batch_size }}", "options": {}},
     "id": str(uuid.uuid4()), "name": "Loop Over Items", "type": "n8n-nodes-base.splitInBatches",
     "typeVersion": 3, "position": [1980, 500]},
    {
        "parameters": {
            "fromEmail": "={{ $json.from }}", "toEmail": "={{ $json.email }}",
            "subject": "={{ $json.subject }}", "emailFormat": "both",
            "text": "={{ $json.text_body }}", "html": "={{ $json.html_body }}",
            "options": {"replyTo": "={{ $json.reply_to }}", "appendAttribution": False},
        },
        "id": str(uuid.uuid4()), "name": "Send Email (Gmail SMTP)", "type": "n8n-nodes-base.emailSend",
        "typeVersion": 2.1, "position": [2200, 520], "onError": "continueRegularOutput",
        "webhookId": str(uuid.uuid4()),
        "credentials": {"smtp": {"id": "REPLACE_ME", "name": "Gmail SMTP"}},
    },
    code_node("Record Result", "record_result", [2420, 520]),
    {"parameters": {"resume": "timeInterval",
                    "amount": "={{ $('Config').first().json.wait_seconds }}", "unit": "seconds"},
     "id": str(uuid.uuid4()), "name": "Wait", "type": "n8n-nodes-base.wait",
     "typeVersion": 1.1, "position": [2640, 520], "webhookId": str(uuid.uuid4())},
    code_node("Send Report", "send_report", [2860, 400]),

    {"parameters": {}, "id": str(uuid.uuid4()), "name": "Skipped (logged)",
     "type": "n8n-nodes-base.noOp", "typeVersion": 1, "position": [1320, 420]},
]

c = {}
link(c, "Campaign Form", "Config")
link(c, "Config", "Read Excel")
link(c, "Read Excel", "Normalize")
link(c, "Normalize", "Validate")
link(c, "Validate", "Eligible?")
link(c, "Eligible?", "Preview Mode?", 0)
link(c, "Eligible?", "Skipped (logged)", 1)
link(c, "Preview Mode?", "Build Prompt", 0)
link(c, "Preview Mode?", "Prepare Send", 1)
for a, b in [("Build Prompt", "Claude Generate Email"), ("Claude Generate Email", "Parse & Validate AI Output"),
             ("Parse & Validate AI Output", "Build Review Rows"), ("Build Review Rows", "Make Review XLSX"),
             ("Make Review XLSX", "Save Review File"), ("Save Review File", "Preview Report")]:
    link(c, a, b)
link(c, "Prepare Send", "Dry Run?")
link(c, "Dry Run?", "Dry Run Log", 0)
link(c, "Dry Run?", "Loop Over Items", 1)
link(c, "Dry Run Log", "Send Report")
link(c, "Loop Over Items", "Send Report", 0)          # done
link(c, "Loop Over Items", "Send Email (Gmail SMTP)", 1)  # loop
link(c, "Send Email (Gmail SMTP)", "Record Result")
link(c, "Record Result", "Wait")
link(c, "Wait", "Loop Over Items")

wf = {"name": "AI Bulk Email Agent", "nodes": nodes, "connections": c,
      "settings": {"executionOrder": "v1"}, "active": False}
(HERE / "bulk_email_agent.json").write_text(json.dumps(wf, indent=2), encoding="utf-8")

# ---------------------------------------------------------------- unsubscribe workflow
u_nodes = [
    {"parameters": {"httpMethod": "GET", "path": "unsubscribe", "responseMode": "responseNode", "options": {}},
     "id": str(uuid.uuid4()), "name": "Unsubscribe Webhook", "type": "n8n-nodes-base.webhook",
     "typeVersion": 2, "position": [0, 0], "webhookId": str(uuid.uuid4())},
    code_node("Add To Suppression List", "unsubscribe", [240, 0]),
    {"parameters": {"respondWith": "text", "responseBody": "={{ $json.html }}",
                    "options": {"responseHeaders": {"entries": [
                        {"name": "Content-Type", "value": "text/html; charset=utf-8"}]}}},
     "id": str(uuid.uuid4()), "name": "Respond", "type": "n8n-nodes-base.respondToWebhook",
     "typeVersion": 1.1, "position": [480, 0]},
]
uc = {}
link(uc, "Unsubscribe Webhook", "Add To Suppression List")
link(uc, "Add To Suppression List", "Respond")
(HERE / "unsubscribe_webhook.json").write_text(
    json.dumps({"name": "Unsubscribe Handler", "nodes": u_nodes, "connections": uc,
                "settings": {"executionOrder": "v1"}, "active": False}, indent=2), encoding="utf-8")
print("Built: bulk_email_agent.json, unsubscribe_webhook.json")
print("Data folder used by the workflow:", DATA_DIR)
