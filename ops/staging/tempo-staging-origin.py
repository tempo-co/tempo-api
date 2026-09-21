#!/usr/bin/env python3
"""Validate staging and production URLs and compare browser-style HTTPS origins."""

from __future__ import annotations

import ipaddress
import re
import sys
from typing import NoReturn, Optional
from urllib.parse import urlsplit


_IPV4_DECIMAL = re.compile(r"^[0-9]+$")
_IPV4_OCTAL = re.compile(r"^[0-7]+$")
_IPV4_HEX = re.compile(r"^[0-9a-fA-F]+$")
_ASCII_HOST = re.compile(r"^[a-z0-9.-]+$")


def fail(message: str) -> NoReturn:
    print(f"tempo staging: {message}", file=sys.stderr)
    raise SystemExit(1)


def parse_ipv4_component(component: str) -> Optional[int]:
    if not component:
        return None
    if component.lower().startswith("0x"):
        digits = component[2:]
        if digits and not _IPV4_HEX.fullmatch(digits):
            return None
        return int(digits or "0", 16)
    if len(component) > 1 and component.startswith("0"):
        digits = component[1:]
        if not _IPV4_OCTAL.fullmatch(digits):
            return None
        return int(digits or "0", 8)
    if not _IPV4_DECIMAL.fullmatch(component):
        return None
    return int(component, 10)


def canonical_ipv4(host: str) -> Optional[str]:
    if host.endswith("."):
        host = host[:-1]
    parts = host.split(".")
    if not 1 <= len(parts) <= 4:
        return None
    values = [parse_ipv4_component(part) for part in parts]
    if any(value is None for value in values):
        return None
    numbers = [value for value in values if value is not None]
    for value in numbers[:-1]:
        if value > 255:
            return None
    final_limit = 1 << (8 * (5 - len(numbers)))
    if numbers[-1] >= final_limit:
        return None
    address = sum(numbers[:-1][index] << (8 * (3 - index)) for index in range(len(numbers) - 1))
    address += numbers[-1]
    return ".".join(str((address >> shift) & 255) for shift in (24, 16, 8, 0))


def canonical_host(host: str) -> str:
    if not host:
        fail("URLs must contain a host")
    if not host.isascii():
        fail("URLs must use ASCII hostnames or punycode")
    host = host.lower()
    if ":" in host:
        try:
            return ipaddress.IPv6Address(host).compressed.lower()
        except ipaddress.AddressValueError:
            fail("URL contains an invalid IPv6 host")
    trailing_dot_stripped = host.rstrip(".")
    last_host_part = trailing_dot_stripped.rsplit(".", 1)[-1]
    ipv4_candidate = (
        _IPV4_DECIMAL.fullmatch(last_host_part) is not None
        or (host.lower().startswith("0x") and _IPV4_HEX.fullmatch(host[2:] or "0") is not None)
    )
    if ipv4_candidate:
        ipv4 = canonical_ipv4(host)
        if ipv4 is None:
            fail("URL contains an invalid IPv4 host")
        return ipv4
    if not _ASCII_HOST.fullmatch(host) or host.startswith(".") or host.endswith("."):
        fail("URL contains an invalid host")
    return host


def browser_origin(value: str, expected_path: str) -> str:
    if "\\" in value or any(ord(char) <= 0x20 for char in value):
        fail("URLs must not contain backslashes, whitespace, or control characters")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        fail("URL contains an invalid port or host")
    if parsed.scheme != "https":
        fail("URLs must use HTTPS")
    if parsed.username is not None or parsed.password is not None or "@" in parsed.netloc:
        fail("URLs must not contain credentials")
    if "?" in value or "#" in value:
        fail("URLs must not contain a query or fragment")
    if parsed.path not in (expected_path, f"{expected_path}/"):
        fail(f"URL path must be {expected_path} or {expected_path}/")
    host = canonical_host(parsed.hostname or "")
    if port is None:
        port = 443
    serialized_port = "" if port == 443 else f":{port}"
    if ":" in host:
        host = f"[{host}]"
    return f"https://{host}{serialized_port}"


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: tempo-staging-origin.py STAGING_URL PRODUCTION_URL")
    staging_origin = browser_origin(sys.argv[1], "/staging")
    production_origin = browser_origin(sys.argv[2], "/tempo")
    if staging_origin == production_origin:
        fail("staging and production URLs must have different browser origins")


if __name__ == "__main__":
    main()
