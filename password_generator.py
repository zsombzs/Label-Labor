#!/usr/bin/env python3
import bcrypt
import getpass

password = getpass.getpass(prompt="Add meg a jelszót: ")

if not password:
    print("Hiba: üres jelszó nem megengedett.")
    exit(1)

# Generáljuk a hash-t (12 rounds)
hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12))

print("\n--- Kész a hash ---")
print(hashed.decode())
print("--------------------\n")
