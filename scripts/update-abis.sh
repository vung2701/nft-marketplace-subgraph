#!/bin/bash

# 🔄 Update ABIs from Contract Artifacts
# This script copies the latest ABIs from the contracts build directory

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
CONTRACTS_DIR="../blockchain/artifacts/contracts"
ABIS_DIR="./abis"

echo -e "${BLUE}🔄 Updating Subgraph ABIs${NC}"
echo ""

# Check if contracts directory exists
if [ ! -d "$CONTRACTS_DIR" ]; then
    echo -e "${RED}❌ Contracts directory not found: $CONTRACTS_DIR${NC}"
    echo -e "${YELLOW}💡 Make sure to build contracts first: cd ../blockchain && npm run compile${NC}"
    exit 1
fi

# Create ABIs directory if it doesn't exist
if [ ! -d "$ABIS_DIR" ]; then
    echo -e "${YELLOW}📁 Creating ABIs directory...${NC}"
    mkdir -p "$ABIS_DIR"
fi

# Function to extract and copy ABI
copy_abi() {
    local contract_name=$1
    local source_path="$CONTRACTS_DIR/$contract_name.sol/$contract_name.json"
    local dest_path="$ABIS_DIR/$contract_name.json"
    
    if [ -f "$source_path" ]; then
        echo -e "${YELLOW}📋 Copying $contract_name ABI...${NC}"
        
        # Extract just the ABI array from the artifact
        jq '.abi' "$source_path" > "$dest_path"
        
        echo -e "${GREEN}✅ $contract_name ABI updated${NC}"
        
        # Show ABI size
        local abi_size=$(jq '. | length' "$dest_path")
        echo -e "${BLUE}   Functions/Events: $abi_size${NC}"
    else
        echo -e "${RED}❌ Contract artifact not found: $source_path${NC}"
        return 1
    fi
}

# Copy main contracts
echo -e "${YELLOW}🔍 Looking for contract artifacts...${NC}"

# NFTMarketplace
if copy_abi "NFTMarketplace"; then
    :
else
    echo -e "${YELLOW}⚠️ NFTMarketplace ABI not found - this might be expected if using a different name${NC}"
fi

# NFTCollection
if copy_abi "NFTCollection"; then
    :
else
    echo -e "${YELLOW}⚠️ NFTCollection ABI not found${NC}"
fi

# Check for alternative names
echo ""
echo -e "${YELLOW}🔍 Checking for alternative contract names...${NC}"

# Common alternative names
ALTERNATIVE_NAMES=(
    "Marketplace"
    "NFTMarketplace"
    "NFTCollection" 
    "ERC721Collection"
    "MyNFT"
)

for name in "${ALTERNATIVE_NAMES[@]}"; do
    artifact_path="$CONTRACTS_DIR/$name.sol/$name.json"
    if [ -f "$artifact_path" ]; then
        echo -e "${BLUE}📁 Found: $name${NC}"
        
        # Ask user if they want to copy this
        read -p "Copy $name as NFTMarketplace? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            jq '.abi' "$artifact_path" > "$ABIS_DIR/NFTMarketplace.json"
            echo -e "${GREEN}✅ Copied $name as NFTMarketplace${NC}"
        fi
    fi
done

# Validate ABI files
echo ""
echo -e "${YELLOW}🔍 Validating ABI files...${NC}"

validate_abi() {
    local file=$1
    local contract_name=$(basename "$file" .json)
    
    if [ -f "$file" ]; then
        # Check if file is valid JSON
        if jq empty "$file" 2>/dev/null; then
            # Check if it contains expected events/functions
            local events=$(jq '[.[] | select(.type == "event")] | length' "$file")
            local functions=$(jq '[.[] | select(.type == "function")] | length' "$file")
            
            echo -e "${GREEN}✅ $contract_name: $events events, $functions functions${NC}"
            
            # Check for specific events we need
            case $contract_name in
                "NFTMarketplace")
                    if jq -e '.[] | select(.name == "NFTListed")' "$file" > /dev/null; then
                        echo -e "${GREEN}   ✅ NFTListed event found${NC}"
                    else
                        echo -e "${YELLOW}   ⚠️ NFTListed event not found${NC}"
                    fi
                    
                    if jq -e '.[] | select(.name == "NFTBought")' "$file" > /dev/null; then
                        echo -e "${GREEN}   ✅ NFTBought event found${NC}"
                    else
                        echo -e "${YELLOW}   ⚠️ NFTBought event not found${NC}"
                    fi
                    ;;
                "NFTCollection")
                    if jq -e '.[] | select(.name == "Transfer")' "$file" > /dev/null; then
                        echo -e "${GREEN}   ✅ Transfer event found${NC}"
                    else
                        echo -e "${YELLOW}   ⚠️ Transfer event not found${NC}"
                    fi
                    ;;
            esac
        else
            echo -e "${RED}❌ $contract_name: Invalid JSON${NC}"
        fi
    else
        echo -e "${RED}❌ $contract_name: File not found${NC}"
    fi
}

# Validate main ABI files
validate_abi "$ABIS_DIR/NFTMarketplace.json"
validate_abi "$ABIS_DIR/NFTCollection.json"

# Show summary
echo ""
echo -e "${BLUE}📊 Summary:${NC}"
echo -e "${BLUE}=================${NC}"

for abi_file in "$ABIS_DIR"/*.json; do
    if [ -f "$abi_file" ]; then
        contract_name=$(basename "$abi_file" .json)
        file_size=$(du -h "$abi_file" | cut -f1)
        echo -e "${BLUE}$contract_name: $file_size${NC}"
    fi
done

echo ""
echo -e "${GREEN}🎉 ABI update completed!${NC}"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo -e "${BLUE}1. Review the updated ABIs${NC}"
echo -e "${BLUE}2. Update contract addresses in subgraph.yaml if needed${NC}"
echo -e "${BLUE}3. Run: npm run codegen${NC}"
echo -e "${BLUE}4. Run: npm run build${NC}" 