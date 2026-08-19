{
  "targets": [
    {
      "target_name": "clipboard",
      "conditions": [
        [
          "OS==\"win\"",
          {
            "sources": [
              "src/clipboard_win.cc",
              "src/export.cc"
            ],
            "include_dirs": [
              "<!@(node -p \"require('node-addon-api').include\")"
            ],
            "dependencies": [
              "<!(node -p \"require('node-addon-api').gyp\")"
            ],
            "defines": [
              "NAPI_CPP_EXCEPTIONS",
              "NAPI_VERSION=3"
            ],
            "libraries": [
              "Shell32.lib",
              "Ole32.lib"
            ],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "AdditionalOptions": ["/std:c++17"],
                "ExceptionHandling": "1"
              }
            }
          },
          {
            "type": "none"
          }
        ]
      ]
    }
  ]
}
