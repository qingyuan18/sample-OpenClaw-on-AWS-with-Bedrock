"""Add role field to existing employees in DynamoDB."""
import argparse
import boto3

ORG = "ORG#acme"

# Role assignments per design doc
ROLES = {
    "emp-jiade": "admin",    # JiaDe Wang — IT Admin (SA lead)
    "emp-chris": "admin",    # Chris Morgan — DevOps lead, also admin
    "emp-alex":  "manager",  # Alex Rivera — Product dept head
    "emp-mike":  "manager",  # Mike Johnson — Sales dept head
    "emp-jenny": "manager",  # Jenny Liu — HR dept head
    # Everyone else: employee (default)
}

def seed(table_name: str, region: str):
    ddb = boto3.resource("dynamodb", region_name=region)
    table = ddb.Table(table_name)

    # Get all employees
    resp = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("PK").eq(ORG) & boto3.dynamodb.conditions.Key("SK").begins_with("EMP#")
    )

    updated = 0
    for item in resp.get("Items", []):
        emp_id = item.get("id", "")
        role = ROLES.get(emp_id, "employee")
        table.update_item(
            Key={"PK": ORG, "SK": f"EMP#{emp_id}"},
            UpdateExpression="SET #r = :role",
            ExpressionAttributeNames={"#r": "role"},
            ExpressionAttributeValues={":role": role},
        )
        updated += 1
        print(f"  {emp_id}: {role}")

    print(f"\nDone! Updated {updated} employees with roles.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--table", default="openclaw-enterprise")
    parser.add_argument("--region", default="us-east-2")
    args = parser.parse_args()
    seed(args.table, args.region)
