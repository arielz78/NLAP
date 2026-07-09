"""R6 scorer eval harness + forced-choice pair collector.

Offline tooling only: reads a Candidates snapshot JSON, writes pair manifests,
a self-contained HTML collector, and grading reports. Never touches Airtable,
n8n, or any pipeline file.
"""
