import Foundation
import Security

guard CommandLine.arguments.count == 3 else {
  FileHandle.standardError.write(Data("uso inválido\n".utf8))
  exit(2)
}

let account = CommandLine.arguments[1]
let service = CommandLine.arguments[2]
let secret = FileHandle.standardInput.readDataToEndOfFile()
guard !secret.isEmpty else {
  FileHandle.standardError.write(Data("segredo vazio\n".utf8))
  exit(2)
}

let query: [String: Any] = [
  kSecClass as String: kSecClassGenericPassword,
  kSecAttrAccount as String: account,
  kSecAttrService as String: service,
]
let attributes: [String: Any] = [kSecValueData as String: secret]
let updated = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
if updated == errSecItemNotFound {
  var create = query
  create[kSecValueData as String] = secret
  let added = SecItemAdd(create as CFDictionary, nil)
  guard added == errSecSuccess else {
    FileHandle.standardError.write(Data("falha no Chaves: \(added)\n".utf8))
    exit(1)
  }
} else if updated != errSecSuccess {
  FileHandle.standardError.write(Data("falha no Chaves: \(updated)\n".utf8))
  exit(1)
}
