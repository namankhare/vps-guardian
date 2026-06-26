# Product Requirements Document (PRD)

# VPS Guardian

**Version:** 1.0
**Status:** Draft
**Author:** HaxWorld
**License:** MIT

---

# 1. Overview

VPS Guardian is a lightweight, modular security monitoring CLI for Ubuntu servers.

It helps developers and system administrators continuously monitor server security, detect common issues, and send actionable alerts to Discord.

Unlike enterprise SIEM solutions, VPS Guardian focuses on simplicity, low resource usage, and ease of deployment.

The project does **not** replace security tools like ClamAV or Fail2Ban. Instead, it integrates with them and provides a unified monitoring and notification layer.

---

# 2. Goals

* Monitor the health and security of Ubuntu VPS servers.
* Aggregate the output of existing security tools.
* Send clean, readable Discord notifications.
* Provide a simple CLI for running checks.
* Be lightweight and dependency-free except for Node.js.
* Support Docker and CloudPanel environments.

---

# 3. Non-Goals

The first version will NOT include:

* Web dashboard
* Database
* Authentication
* Remote agents
* Package installation
* Automatic malware removal
* Automatic AIDE baseline updates

---

# 4. Target Users

* Developers
* DevOps Engineers
* Freelancers
* VPS Owners
* WordPress Administrators
* Small businesses

---

# 5. Supported Platforms

## Operating Systems

* Ubuntu 22.04 LTS
* Ubuntu 24.04 LTS

Future

* Debian
* Rocky Linux
* AlmaLinux

---

# 6. Supported Software

## Security

* ClamAV
* Linux Malware Detect (Maldet)
* AIDE
* RKHunter
* Fail2Ban

## Infrastructure

* Docker
* CloudPanel
* Nginx
* PHP-FPM

Future

* Mailcow
* MySQL
* PostgreSQL
* MongoDB
* Redis

---

# 7. Architecture

```text
CLI

↓

Core Runner

↓

Module Manager

↓

Security Modules

↓

Module Result

↓

Notifier

↓

Discord
```

Each module is completely independent.

Modules never communicate with each other.

---

# 8. Core Principles

## Detect

Detect whether supported software is installed.

## Monitor

Collect health and security information.

## Notify

Send alerts only when necessary.

## Never Modify

The application must never:

* install packages
* remove malware
* update AIDE databases
* modify firewall rules
* restart services

---

# 9. Project Structure

```text
vps-guardian

src/

cli/

core/

modules/

notifier/

config/

types/

utils/

tests/

docs/

scripts/
```

---

# 10. CLI Commands

## doctor

Detect installed software.

Example

guardian doctor

---

## health

Display system health.

Example

guardian health

---

## scan

Run all enabled modules.

Example

guardian scan

---

## module

Run a single module.

Example

guardian aide

guardian maldet

guardian rkhunter

---

## report

Generate weekly report.

guardian report

---

## version

Display version.

guardian version

---

## help

guardian help

---

# 11. Module Interface

Every module must implement:

* id
* name
* description
* isInstalled()
* run()

Each module returns a standardized result object.

---

# 12. Module Result

Every module returns:

* Module name
* Status
* Severity
* Summary
* Details
* Execution duration

Status values:

* healthy
* warning
* critical
* skipped

Severity values:

* info
* warning
* critical

---

# 13. Notification System

Supported provider:

* Discord Webhooks

Future:

* Slack
* Telegram
* Email
* Microsoft Teams

Notifications should use Discord embeds.

Alert colors:

Green

Healthy

Yellow

Warning

Red

Critical

---

# 14. Configuration

Configuration file:

guardian.yml

Example:

Hostname

Discord webhook

Enabled modules

Scan paths

Log directory

Notification preferences

---

# 15. Logging

Logs stored locally.

Separate logs for:

Application

Module execution

Errors

Maximum log retention:

30 days

---

# 16. Error Handling

Missing dependency

Module returns "Skipped"

Command timeout

Module returns "Warning"

Unexpected exception

Module returns "Critical"

Application should never crash because one module failed.

---

# 17. Health Module

Collect:

CPU usage

Memory usage

Disk usage

Load average

Uptime

Pending reboot

Pending updates

Docker container count

---

# 18. Security Modules

## AIDE

Run integrity check.

Alert when:

Files changed

Files removed

Files added

---

## Maldet

Run malware scan.

Alert when malware detected.

---

## ClamAV

Run scan.

Alert when infected files detected.

---

## RKHunter

Run check.

Alert only for warnings or rootkit findings.

---

## Fail2Ban

Collect:

Banned IP count

New bans

Running status

---

# 19. Weekly Report

Generate a security summary.

Include:

Overall health

Malware status

Integrity status

Fail2Ban statistics

Docker status

Disk usage

Memory usage

Pending updates

Overall security score

---

# 20. Design Principles

Small modules

Single responsibility

Strict typing

Minimal dependencies

Readable console output

Useful notifications

No unnecessary background services

---

# 21. Future Roadmap

## v1.1

Docker monitoring

SSL expiry

Package updates

Disk alerts

---

## v1.2

CloudPanel support

Mailcow support

Database monitoring

---

## v2.0

REST API

Web dashboard

Multiple server management

Role-based authentication

---

# 22. Success Criteria

The project is considered successful when a user can:

* Install VPS Guardian in under 5 minutes.
* Configure Discord notifications in under 2 minutes.
* Run "guardian doctor" successfully.
* Receive actionable security alerts.
* Understand server health without manually checking multiple tools.
* Extend the project by adding a new module with minimal changes to the core.

---

# 23. Coding Standards

* TypeScript strict mode enabled.
* Use pnpm for package management.
* Use Biome for formatting and linting.
* Use Vitest for testing.
* Avoid shell-specific parsing where possible.
* Keep modules independent and reusable.
* Favor composition over inheritance.
* Every public function should have clear documentation.

---

# 24. Open Source Guidelines

License: MIT

Contributions welcome via Pull Requests.

Every new feature should:

* Include tests where practical.
* Update documentation.
* Follow the module interface.
* Avoid breaking existing CLI commands.
