import json

# Load the district mapping
with open('public/data/district_localbody_mapping.json', 'r', encoding='utf-8') as f:
    mapping = json.load(f)

# Convert to wardMetadata format
wardMetadata = {}

for district_name, bodies_list in mapping.items():
    wardMetadata[district_name] = {}
    
    for body_obj in bodies_list:
        local_body_name = body_obj.get('LocalBody', '')
        
        # Determine the type based on the local body data
        body_type = body_obj.get('Type', 'Grama Panchayat')
        
        # Fallback type detection if Type field is not present
        if not body_type or body_type == '':
            if 'Corporation' in local_body_name:
                body_type = 'Corporation'
            elif 'Municipality' in local_body_name:
                body_type = 'Municipality'
            elif 'District Panchayat' in local_body_name:
                body_type = 'District Panchayat'
            elif 'Block Panchayat' in local_body_name:
                body_type = 'Block Panchayat'
            else:
                body_type = 'Grama Panchayat'
        
        # Normalize type name (capitalize properly)
        if body_type:
            body_type = body_type.strip()
        
        if body_type not in wardMetadata[district_name]:
            wardMetadata[district_name][body_type] = []
        
        wardMetadata[district_name][body_type].append(local_body_name)

# Remove duplicates and sort
for district in wardMetadata:
    for body_type in wardMetadata[district]:
        wardMetadata[district][body_type] = sorted(list(set(wardMetadata[district][body_type])))

# Save as JSON file
with open('wardMetadata.json', 'w', encoding='utf-8') as f:
    json.dump(wardMetadata, f, ensure_ascii=False, indent=2)

# Also save as JavaScript file
with open('wardMetadata.js', 'w', encoding='utf-8') as f:
    f.write('const wardMetadata = ' + json.dumps(wardMetadata, ensure_ascii=False, indent=2) + ';\n')

print("✅ wardMetadata.json generated successfully!")
print("✅ wardMetadata.js generated successfully!")
print(f"Total districts: {len(wardMetadata)}")

# Print summary
total_bodies = sum(len(bodies) for district in wardMetadata.values() for bodies in district.values())
print(f"Total local bodies: {total_bodies}")

# Show sample
print("\n📋 Sample data:")
first_district = list(wardMetadata.keys())[0]
print(f"{first_district}: {wardMetadata[first_district]}")
