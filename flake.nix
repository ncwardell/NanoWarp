{
  description = "NanoWarp - Lightning-fast file-based API framework (dev shell)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f:
        nixpkgs.lib.genAttrs systems (system: f (import nixpkgs { inherit system; }));
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.bun
            pkgs.nodejs_20
            pkgs.git
          ];

          shellHook = ''
            echo "NanoWarp dev shell"
            echo "  bun  $(bun --version 2>/dev/null || echo unavailable)"
            echo "  node $(node --version)"
            echo ""
            echo "Common commands:"
            echo "  bun install        # install dependencies"
            echo "  bun test           # run test suite"
            echo "  bun run example    # start example server"
            echo "  bun run build      # compile to dist/"
          '';
        };
      });
    };
}
